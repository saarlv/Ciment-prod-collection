export const TASK_STATUS_ACTIVITY_TYPE = 'task_status';

export function longRunningTaskIdOf(result: string | undefined): string | null {
  if (!result || !result.trim().startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(result) as { status?: unknown; taskId?: unknown };
    if (
      (parsed.status === 'started' || parsed.status === 'working') &&
      typeof parsed.taskId === 'string' &&
      parsed.taskId
    ) {
      return parsed.taskId;
    }
  } catch {
    return null;
  }
  return null;
}

export function finishedTaskIdsOf(
  messages: readonly {
    role?: string;
    activityType?: string;
    content?: unknown;
  }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (
      message.role !== 'activity' ||
      message.activityType !== TASK_STATUS_ACTIVITY_TYPE
    ) {
      continue;
    }
    const taskId = (message.content as { taskId?: unknown } | undefined)
      ?.taskId;
    if (typeof taskId === 'string' && taskId) {
      ids.add(taskId);
    }
  }
  return ids;
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line