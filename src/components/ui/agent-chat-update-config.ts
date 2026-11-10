export const UPDATE_CONFIG_TOOL_NAME = 'update_my_configuration';
/** The waiting card's question; a decided card shows the summary instead of a title. */
export const UPDATE_CONFIG_TITLE = 'Remember this rule?';

export type UpdateConfigOutcome =
  | { kind: 'pending' }
  | { kind: 'moved'; feedbackThreadId: string }
  | { kind: 'started'; taskId?: string }
  | { kind: 'rejected' }
  | { kind: 'unavailable' }
  | { kind: 'other' }
  | { kind: 'failed' };

/** The feedback thread an approved change continues in — the server builds the same id. */
export const feedbackBranchThreadId = (toolCallId: string): string =>
  `fb-${toolCallId}`;

export const updateConfigOutcomeOf = (
  result: string | undefined,
  toolCallId: string,
): UpdateConfigOutcome => {
  if (result === undefined || result === '') {
    return { kind: 'pending' };
  }
  if (result.startsWith('User rejected')) {
    return { kind: 'rejected' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return { kind: 'failed' };
  }
  const status =
    parsed && typeof parsed === 'object'
      ? (parsed as { status?: unknown }).status
      : undefined;
  if (status === 'moved') {
    const id = (parsed as { feedbackThreadId?: unknown }).feedbackThreadId;
    return {
      kind: 'moved',
      feedbackThreadId:
        typeof id === 'string' && id ? id : feedbackBranchThreadId(toolCallId),
    };
  }
  if (status === 'started') {
    const taskId = (parsed as { taskId?: unknown }).taskId;
    return {
      kind: 'started',
      ...(typeof taskId === 'string' && taskId ? { taskId } : {}),
    };
  }
  if (status === 'failed') {
    return { kind: 'failed' };
  }
  if (status === 'approval_unavailable') {
    return { kind: 'unavailable' };
  }
  // A status this renderer does not know: say nothing about it, show the plain tool step.
  return { kind: 'other' };
};

const stringArg = (args: unknown, key: string): string => {
  const value =
    args && typeof args === 'object'
      ? (args as Record<string, unknown>)[key]
      : undefined;
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * What the card shows: the agent's one-or-two-sentence `summary` for the user. A call made
 * before the tool had one shows its `change_request`, the builder brief, instead.
 */
export const updateConfigCardText = (args: unknown): string =>
  stringArg(args, 'summary') || stringArg(args, 'change_request');

/** A decided card's text: the decided args' (they are the call's own), else the transcript's. */
export const updateConfigShownText = (
  decidedArgs: unknown,
  callText: string,
): string => updateConfigCardText(decidedArgs) || callText;

/**
 * The full change request behind a summary, for the waiting card's collapsed Show details: what
 * is actually applied, so the summary can be checked against it. Empty when there is no summary
 * (the card already shows the request) or the two are the same.
 */
export const updateConfigDetailsText = (args: unknown): string => {
  const summary = stringArg(args, 'summary');
  const changeRequest = stringArg(args, 'change_request');
  return summary && changeRequest !== summary ? changeRequest : '';
};

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line