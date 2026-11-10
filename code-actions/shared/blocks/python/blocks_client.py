"""Blocks platform SDK for Python code actions.

Port of shared/blocks/blocks-client.ts with the same endpoints and payload shapes.
Deliberately stdlib-only (urllib) so an action with no dependencies ships a zip with
no pip tree at all.

    from blocks import BlocksClient

    def invoke(payload, context):
        client = BlocksClient(context)
        rows = client.query_table("Tasks", {"from": {"table": "Tasks"}})
        return {"count": len(rows["items"])}
"""

import base64
import http.client
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from .mappings import BLOCKS_CLIENT_MAPPINGS

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

DEFAULT_TIMEOUT_SECONDS = 120
ACTION_RESULT_MEDIA_TYPE = "application/vnd.blocks.action-result.v1+json"
# The structured `code` wf-service answers a sync start of a durable action with.
DURABLE_REQUIRES_ASYNC = "DURABLE_REQUIRES_ASYNC"


def _error_code(body):
    """The structured `code` of an error body (a JSON string or a parsed dict), or None."""
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except ValueError:
            return None
    code = body.get("code") if isinstance(body, dict) else None
    return code if isinstance(code, str) else None


class BlocksApiError(Exception):
    """A platform API call failed.

    `status` is the HTTP status for a non-2xx response, or None when the request never
    got one (DNS/connection/timeout). Every failure mode of every client method raises
    this one type, so `except BlocksApiError` is all an action ever needs. `code` is the
    structured error code from the response body when the service sent one (else None) —
    branch on it, never on the message.
    """

    def __init__(self, method, url, status, body, code=None):
        super().__init__(
            "Failed to {} call {}: {} {}".format(
                method, url, status if status is not None else "no response", body
            )
        )
        self.status = status
        self.body = body
        self.code = code


class BlocksClient:
    def __init__(self, context, timeout=DEFAULT_TIMEOUT_SECONDS):
        self._base_path = os.environ.get("BLOCKS_BASE_PATH") or ""
        self._context = context or {}
        self._timeout = timeout

    # ── transport ──

    def _api_call(self, method, url, data=None, stream_action=False):
        final_url = "{}{}".format(self._base_path, url)
        body = json.dumps(data).encode("utf-8") if data is not None else None
        request = urllib.request.Request(final_url, data=body, method=method)
        request.add_header("Content-Type", "application/json")
        if stream_action:
            request.add_header("Accept", ACTION_RESULT_MEDIA_TYPE)
            request.add_header("Accept-Encoding", "identity")
        request.add_header("Authorization", "Bearer {}".format(self._token))
        request.add_header("x-app-id", str(self._context.get("appId") or ""))
        app_version = self._context.get("appVersion")
        if app_version is not None:
            request.add_header("x-app-version", str(app_version))
        # The platform's request-context envelope (base64 JSON), carrying only the depth of the
        # data-trigger cascade this run is part of: data-service reads the depth of a write from it
        # alone, and wf-service starts a nested run from it. Without it a write made here restarts
        # the loop guard at zero.
        trigger_depth = self._context.get("triggerDepth")
        if isinstance(trigger_depth, (int, float)) and not isinstance(trigger_depth, bool):
            request.add_header(
                "x-request-context",
                base64.b64encode(
                    json.dumps({"triggerDepth": trigger_depth}).encode("utf-8")
                ).decode("ascii"),
            )
        request.add_header("user-agent", USER_AGENT)

        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                raw = response.read().decode("utf-8")
                status = response.status
                streamed = (
                    stream_action
                    and response.headers.get_content_type() == ACTION_RESULT_MEDIA_TYPE
                )
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", errors="replace")
            raise BlocksApiError(
                method, url, error.code, raw, code=_error_code(raw)
            ) from error
        except (
            urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException
        ) as error:
            # A request that never got a response (DNS, refused connection, timeout) is
            # still "the platform call failed" — raise the same type so an action does not
            # have to catch urllib's exception tree to handle it.
            raise BlocksApiError(method, url, None, str(error)) from error

        if status >= 300:
            raise BlocksApiError(method, url, status, raw, code=_error_code(raw))
        if not raw and not streamed:
            return None
        try:
            result = json.loads(raw)
        except ValueError:
            if streamed:
                raise BlocksApiError(method, url, status, "Invalid action response")
            return raw
        if streamed:
            if not isinstance(result, dict) or not isinstance(result.get("ok"), bool):
                raise BlocksApiError(method, url, status, "Invalid action response")
            if not result["ok"]:
                error = result.get("error")
                if not isinstance(error, dict) or not isinstance(
                    error.get("message"), str
                ):
                    raise BlocksApiError(method, url, status, "Invalid action error response")
                raise BlocksApiError(
                    method,
                    url,
                    error.get("statusCode"),
                    error["message"],
                    code=_error_code(error),
                )
            return result.get("output")
        return result

    @property
    def _token(self):
        return self._context.get("token") or ""

    # ── actions ──

    def _action_path(self, action_name):
        action_id = BLOCKS_CLIENT_MAPPINGS.get(action_name)
        if not action_id:
            raise ValueError("action {} not found".format(action_name))
        # The ref must occupy exactly ONE path segment. Under the unified (v2) block model it
        # is a named ref ("productSlug/BlockName", plus "&"-joined segments for a table-ops
        # tool), and wf-service serves only single-segment ":workflowId" routes — a raw "/"
        # becomes a second segment and matches no route (404). Encoded, it round-trips: Express
        # decodes the param and blocks-store resolves the qualified ref. Byte-identical for a
        # plain block id, so apps on the older block model keep the exact URL they use today;
        # their "&"-joined composites become "%26", decoded back before the split on "&".
        return "/workflow/api/{}".format(urllib.parse.quote(action_id, safe=""))

    def _action_body(self, input_data):
        return {
            "input": input_data,
            "context": {
                "appId": self._context.get("appId"),
                "mainWorkflowId": self._context.get("mainWorkflowId"),
                # Carried, not re-derived: a nested call out of a dependency code
                # action is still a step of the caller's run, so its rows have to keep
                # landing in the caller's feed rather than under the host app this code
                # happens to execute as. Absent when the two coincide.
                "logAppId": self._context.get("logAppId"),
                "logAppVersion": self._context.get("logAppVersion"),
            },
        }

    def invoke_action(self, action_name, input_data):
        """Run an action and wait for its output.

        A durable action cannot be run this way: start it with invoke_action_async.
        """
        path = self._action_path(action_name)
        try:
            return self._api_call(
                "POST", path, self._action_body(input_data), stream_action=True
            )
        except BlocksApiError as error:
            if error.code != DURABLE_REQUIRES_ASYNC:
                raise
            raise BlocksApiError(
                "POST",
                path,
                error.status,
                "Action {} is durable and can only be started asynchronously: use "
                "invoke_action_async({!r}, input_data) and check it with "
                "get_action_run_status(workflow_id).".format(action_name, action_name),
                code=error.code,
            ) from error

    def invoke_action_async(self, action_name, input_data):
        """Start an action without waiting for it (the only way to start a durable action).

        Returns {"workflowId": ...}. Check on the run with get_action_run_status; never
        poll it in a loop here — a code action has a hard time limit.
        """
        return self._api_call(
            "POST",
            "{}/async".format(self._action_path(action_name)),
            self._action_body(input_data),
        )

    def get_action_run_status(self, workflow_id):
        """Status of a run started with invoke_action_async: {"status", "progress"?, "awaitingRetry"?, "paused"?, "pausable"?}.

        "awaitingRetry" is present while the run is paused after a failure, "paused" while it is
        paused on request; resume_action_run continues it either way. "pausable" is False while
        something is waiting synchronously on the run, so pause_action_run would be refused.
        """
        return self._api_call(
            "GET",
            "/workflow/api/{}/status".format(urllib.parse.quote(str(workflow_id), safe="")),
        )

    def cancel_action_run(self, workflow_id):
        """Ask a run started with invoke_action_async to stop."""
        return self._api_call(
            "POST",
            "/workflow/api/{}/cancel".format(urllib.parse.quote(str(workflow_id), safe="")),
        )

    def pause_action_run(self, workflow_id):
        """Pause a durable run: no new step or loop item starts until resume_action_run; what is
        running finishes. Fails with code RUN_NOT_RUNNING once the run has ended, RUN_NOT_PAUSABLE
        when something is waiting synchronously on it, RUN_NOT_CONTROLLABLE for a run started
        before run control existed.
        """
        return self._api_call(
            "POST",
            "/workflow/api/{}/pause".format(urllib.parse.quote(str(workflow_id), safe="")),
        )

    def resume_action_run(self, workflow_id):
        """Resume a paused durable run (its status lists "awaitingRetry"): failed steps and loop
        items run again, what succeeded stays done. Returns {"workflowId", "retried"}. Fails with
        code RUN_NOT_RESUMABLE once the run has ended, NOTHING_TO_RESUME when nothing waits,
        RUN_NOT_CONTROLLABLE for a run started before run control existed.
        """
        return self._api_call(
            "POST",
            "/workflow/api/{}/resume".format(urllib.parse.quote(str(workflow_id), safe="")),
        )

    def generate_file_signed_url(self, file_url):
        return self.invoke_action("GenerateFileSignedUrl", {"fileUrl": file_url})

    def get_app_links(self):
        """The app's absolute addresses, no trailing slash: {"standaloneUrl", "platformUrl"}.

        standaloneUrl is its public address (custom domain, else its Blocks app URL), for
        anyone outside the app's Blocks workspace: f"{standaloneUrl}/orders/123".
        platformUrl is the app inside the Blocks platform, for workspace members; the path
        goes in app-path: f"{platformUrl}/v?app-path=/orders/123".
        """
        app_id = urllib.parse.quote(str(self._context.get("appId") or ""), safe="")
        return self._api_call("GET", f"/api/domains/app-links/{app_id}")

    def get_current_user(self):
        return {"user": self._api_call("GET", "/app-users/api/current")}

    # ── data ──

    def create_item(self, table_name, item):
        response = self._api_call(
            "POST", "/data/api/tables/{}/items".format(table_name), [item]
        )
        items = (response or {}).get("items") or []
        return {"item": items[0] if items else None}

    def create_items(self, table_name, items):
        return self._api_call(
            "POST", "/data/api/tables/{}/items".format(table_name), list(items)
        )

    def get_item(self, table_name, item_id):
        return self._api_call(
            "GET", "/data/api/tables/{}/items/{}".format(table_name, item_id)
        )

    def update_item(self, table_name, item_id, item):
        return self._api_call(
            "PUT", "/data/api/tables/{}/items/{}".format(table_name, item_id), item
        )

    def update_items(self, table_name, items):
        return self._api_call(
            "PUT",
            "/data/api/tables/{}/items".format(table_name),
            {"items": list(items)},
        )

    def delete_item(self, table_name, item_id):
        return self._api_call(
            "DELETE", "/data/api/tables/{}/items/{}".format(table_name, item_id)
        )

    def delete_items(self, table_name, body):
        return self._api_call(
            "POST", "/data/api/tables/{}/items/delete".format(table_name), body
        )

    def query_table(self, table_name, query):
        return self._api_call(
            "POST", "/data/api/tables/{}/query".format(table_name), query
        )
