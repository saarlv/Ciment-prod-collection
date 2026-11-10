"""Lambda entry point for Python code actions.

Bundled into the deployment zip as `index.py` (handler `index.handler`) by
apps/compiler/src/modules/lambda/python-bundler.ts. The event/result contract is
identical to the Node runtime (shared/blocks/index.ts) so wf-actions' LambdaInvoker
does not care which language an action is written in:

    event  = {"secretKey": str, "requestId": str, "payload": dict, "context": dict,
              "secrets": dict, "captureLogs": bool}
    result = whatever invoke() returns, or {"success": False, "error": str}

With "captureLogs": true the reply is {"__blocksRunEnvelope": 1, "result": <the above>,
"logs": str} instead: what the run printed, for the app's activity log.

The user's action lives at action/ai_generated_code.py and must export `invoke`:

    def invoke(payload: dict, context: dict) -> dict: ...

`async def invoke` is supported too, and a third `tools` argument is passed when the
signature accepts one (always `{}` today — browsing is JavaScript-only).
"""

import asyncio
import inspect
import os
import sys
import traceback
import uuid

# Platform-owned: the shared secret that authenticates every call into this function.
# Cached here and dropped from os.environ so the user action — imported lazily inside
# handler(), i.e. after this runs — can never read or leak it. Node parity: see the
# same capture/delete block in shared/blocks/index.ts.
SECRET_KEY = os.environ.pop("BLOCKS_SECRET_KEY", None)


def _build_user_secrets(event_secrets):
    """User secrets are resolved by wf-actions on every invocation and arrive on the
    event, so a rotated secret takes effect without a redeploy. They are never in the
    Lambda env, and user code never sees the raw env (which holds the execution-role
    AWS credentials)."""
    return event_secrets if isinstance(event_secrets, dict) else {}


# Run logs: when the invoke asks for them (event "captureLogs"), what the action prints also comes
# back with its result, so the app's activity log — and the builder chat reading it — can show it.
# It still goes to CloudWatch as before. The TAIL is kept: a failed run's last lines are the ones
# that explain it. Node parity: RunLogBuffer in shared/blocks/index.ts.
RUN_LOGS_MAX_CHARS = 32_000
RUN_ENVELOPE_KEY = "__blocksRunEnvelope"


class _RunLogBuffer:
    def __init__(self):
        self._text = ""
        self._dropped_chars = 0

    def append(self, text):
        self._text += text
        # Trim in batches, not per write, so a print-heavy action doesn't re-copy the buffer.
        if len(self._text) > RUN_LOGS_MAX_CHARS * 2:
            cut = len(self._text) - RUN_LOGS_MAX_CHARS
            self._dropped_chars += cut
            self._text = self._text[cut:]

    def text(self):
        over = max(0, len(self._text) - RUN_LOGS_MAX_CHARS)
        dropped = self._dropped_chars + over
        tail = self._text[over:]
        if dropped > 0:
            return "[{} earlier characters truncated]\n{}".format(dropped, tail)
        return tail


class _RequestIdPrefixStream:
    """Prefix every stdout/stderr line with the request id, matching the Node
    runtime's console.log wrapper so logs correlate per invocation."""

    def __init__(self, stream, request_id, run_logs=None):
        self._stream = stream
        self._prefix = "[{}] ".format(request_id)
        self._at_line_start = True
        self._run_logs = run_logs

    def write(self, text):
        if not text:
            return 0
        if self._run_logs is not None:
            self._run_logs.append(text)
        # Prefix per line, not per character: an action that logs megabytes should not pay
        # a per-character rebuild of its own output.
        parts = []
        for index, segment in enumerate(text.split("\n")):
            if index > 0:
                parts.append("\n")
                self._at_line_start = True
            if segment:
                if self._at_line_start:
                    parts.append(self._prefix)
                    self._at_line_start = False
                parts.append(segment)
        return self._stream.write("".join(parts))

    def flush(self):
        self._stream.flush()

    def isatty(self):
        return False

    def __getattr__(self, name):
        return getattr(self._stream, name)


def _call_invoke(invoke, payload, context):
    # Pass `tools` only when the action asked for it, so the common two-argument
    # signature stays the documented one.
    try:
        arity = len(
            [
                parameter
                for parameter in inspect.signature(invoke).parameters.values()
                if parameter.kind
                in (parameter.POSITIONAL_ONLY, parameter.POSITIONAL_OR_KEYWORD)
            ]
        )
    except (TypeError, ValueError):
        arity = 2
    args = (payload, context, {}) if arity >= 3 else (payload, context)
    result = invoke(*args)
    if inspect.isawaitable(result):
        return asyncio.run(_await(result))
    return result


async def _await(awaitable):
    return await awaitable


def handler(event, _lambda_context=None):
    # Fail closed: a missing/empty BLOCKS_SECRET_KEY must reject, never accept-all.
    if not SECRET_KEY or (event or {}).get("secretKey") != SECRET_KEY:
        return {"success": False, "error": "Unauthorized"}

    event = event or {}
    if event.get("captureLogs") is not True:
        return _run(event, None)
    run_logs = _RunLogBuffer()
    result = _run(event, run_logs)
    return {RUN_ENVELOPE_KEY: 1, "result": result, "logs": run_logs.text()}


def _run(event, run_logs):
    request_id = event.get("requestId") or str(uuid.uuid4())
    payload = event.get("payload") or {}
    context = event.get("context") or {}
    context["secrets"] = _build_user_secrets(event.get("secrets"))

    original_stdout, original_stderr = sys.stdout, sys.stderr
    sys.stdout = _RequestIdPrefixStream(original_stdout, request_id, run_logs)
    sys.stderr = _RequestIdPrefixStream(original_stderr, request_id, run_logs)
    try:
        # Imported inside the handler so an ImportError in user code (e.g. a missing
        # dependency) is reported as a failed invocation instead of an init crash.
        from action.ai_generated_code import invoke

        return _call_invoke(invoke, payload, context)
    except Exception as error:  # noqa: BLE001 — user code may raise anything
        return {
            "success": False,
            "error": str(error) or error.__class__.__name__,
            "stack": traceback.format_exc(),
        }
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
