export type FeedbackRefRate = 1 | -1 | 0;

export interface FeedbackRefDraft {
  rate: FeedbackRefRate;
  messageId?: string;
}

export interface FeedbackRefMeta {
  name?: string;
  leadingParts?: { type: 'text'; text: string }[];
}

const FEEDBACK_MESSAGE_NAME = 'feedback';
const TAG_PATTERN = /^\s*<feedback\b[^>]*\/?>\s*$/i;
const RATE_PATTERN = /\brate\s*=\s*"([^"]*)"/i;
const MESSAGE_ID_PATTERN = /\bmessageId\s*=\s*"([^"]*)"/i;
// A quote, an angle bracket or whitespace would end the attribute or the tag early.
const MARKER_SAFE_ID_PATTERN = /^[^"<>\s]+$/;
const LINE_PATTERN = /^\[The user (?:rated|commented on) .*\]$/;
const EXCERPT_MAX_CHARS = 300;

const toRate = (value: string | undefined): FeedbackRefRate => {
  const rate = Number(value);
  return rate > 0 ? 1 : rate < 0 ? -1 : 0;
};

const marker = ({ rate, messageId }: FeedbackRefDraft): string =>
  messageId && MARKER_SAFE_ID_PATTERN.test(messageId)
    ? `<feedback rate="${rate}" messageId="${messageId}" />`
    : `<feedback rate="${rate}" />`;

const parseMarker = (text: string | undefined): FeedbackRefDraft | null => {
  if (text === undefined || !TAG_PATTERN.test(text)) {
    return null;
  }
  const messageId = MESSAGE_ID_PATTERN.exec(text)?.[1]?.trim();
  return {
    rate: toRate(RATE_PATTERN.exec(text)?.[1]),
    ...(messageId ? { messageId } : {}),
  };
};

/** The line that tells the agent which reply a thumb + comment is about. */
export const feedbackRefLine = (
  rate: FeedbackRefRate,
  replyText?: string,
): string => {
  const collapsed = (replyText ?? '').replace(/\s+/g, ' ').trim();
  const excerpt =
    collapsed.length > EXCERPT_MAX_CHARS
      ? `${collapsed.slice(0, EXCERPT_MAX_CHARS)}…`
      : collapsed;
  if (rate === 0) {
    return excerpt
      ? `[The user commented on your earlier reply: "${excerpt}"]`
      : '[The user commented on one of your earlier replies]';
  }
  const verdict = rate > 0 ? 'positively' : 'negatively';
  return excerpt
    ? `[The user rated your earlier reply ${verdict}: "${excerpt}"]`
    : `[The user rated one of your earlier replies ${verdict}]`;
};

/** True for the shapes `feedbackRefLine` produces. */
export const isFeedbackRefLine = (text: string): boolean =>
  LINE_PATTERN.test(text.trim());

/** Arms the composer: the marker and the line as the leading parts, and NO `name`. */
export const feedbackRefComposerMeta = (
  draft: FeedbackRefDraft,
  replyText?: string,
): FeedbackRefMeta => ({
  leadingParts: [
    { type: 'text', text: marker(draft) },
    { type: 'text', text: feedbackRefLine(draft.rate, replyText) },
  ],
});

/** The thumb a composer is armed with, or null. */
export const feedbackRefDraftOf = (
  meta: FeedbackRefMeta | null | undefined,
): FeedbackRefDraft | null =>
  meta && !meta.name ? parseMarker(meta.leadingParts?.[0]?.text) : null;

const firstText = (content: unknown): string | undefined => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const part of content) {
    if (
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text'
    ) {
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : undefined;
    }
  }
  return undefined;
};

/** The rating a sent thumb + comment carries, or null for any other message. */
export const leadingFeedbackRateOf = (message: {
  role: string;
  name?: string;
  content?: unknown;
}): FeedbackRefRate | null => {
  if (message.role !== 'user' || message.name === FEEDBACK_MESSAGE_NAME) {
    return null;
  }
  return parseMarker(firstText(message.content))?.rate ?? null;
};

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line