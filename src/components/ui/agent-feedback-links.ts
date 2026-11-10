import * as React from 'react';

/*
 * Where the feedback notes lead — the reply thread a comment opened, the conversation a feedback
 * thread rates, the feedback thread an approved change continues in. Its own file, with no
 * imports from the chat, so the chat itself can use it without an import cycle.
 */

export interface AgentFeedbackLinks {
  /**
   * Open another conversation of the same agent, under the same chat as the open one, by its
   * thread id.
   */
  openThread: (threadId: string) => void;
}

/** Without a provider the notes render, but lead nowhere. */
export const AgentFeedbackLinksContext =
  React.createContext<AgentFeedbackLinks | null>(null);

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line