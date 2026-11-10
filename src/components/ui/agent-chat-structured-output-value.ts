import { stringify } from 'yaml';

/*
 * Pure helpers for an agent's structured answer. The server flags it through AG-UI
 * message `metadata`; these read the JSON back out of the message and show it as YAML,
 * like the builder chat shows tool values.
 */

/** AG-UI message metadata key the server sets on a structured answer (wf-actions-py structured_output_stamp). */
export const STRUCTURED_OUTPUT_METADATA_KEY = 'blocks.structuredOutput';

export type StructuredOutput =
  | { kind: 'content'; value: unknown; componentId?: string }
  | {
      kind: 'toolCall';
      toolCallId: string;
      value: unknown;
      componentId?: string;
    };

export interface StructuredOutputMessage {
  content?: unknown;
  metadata?: unknown;
  toolCalls?: { id: string; function: { name: string; arguments: string } }[];
}

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The server's stamp: `metadata["blocks.structuredOutput"]` (wf-actions-py structured_output_stamp). */
const stampOf = (
  metadata: unknown,
): { componentId?: string; toolCallId?: string } | null => {
  if (!isPlainObject(metadata)) {
    return null;
  }
  const stamp = metadata[STRUCTURED_OUTPUT_METADATA_KEY];
  if (!isPlainObject(stamp) || stamp.isStructuredOutput !== true) {
    return null;
  }
  return {
    componentId:
      typeof stamp.componentId === 'string' ? stamp.componentId : undefined,
    toolCallId:
      typeof stamp.toolCallId === 'string' ? stamp.toolCallId : undefined,
  };
};

const parseContainer = (text: string): { value: unknown } | null => {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? { value } : null;
  } catch {
    return null;
  }
};

const textOf = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) =>
      isPlainObject(part) &&
      part.type === 'text' &&
      typeof part.text === 'string'
        ? part.text
        : '',
    )
    .join('');
};

/** The server flagged this assistant message as structured output (absent on older runtimes). */
export function isStructuredOutputMessage(message: {
  role: string;
  metadata?: unknown;
}): boolean {
  return message.role === 'assistant' && stampOf(message.metadata) !== null;
}

/**
 * The JSON of a message the server marked as structured output: the arguments of its
 * tool call (ToolStrategy) or its text (ProviderStrategy). Null when it does not parse
 * to an object or array, so the message renders as it always did.
 */
export function structuredOutputOf(
  message: StructuredOutputMessage,
): StructuredOutput | null {
  const stamp = stampOf(message.metadata);
  const componentId = stamp?.componentId
    ? { componentId: stamp.componentId }
    : {};
  const toolCall = stamp?.toolCallId
    ? message.toolCalls?.find((call) => call.id === stamp.toolCallId)
    : message.toolCalls?.[message.toolCalls.length - 1];
  if (stamp?.toolCallId && !toolCall) {
    return null;
  }
  if (toolCall) {
    const parsed = parseContainer(toolCall.function.arguments);
    return parsed
      ? {
          kind: 'toolCall',
          toolCallId: toolCall.id,
          value: parsed.value,
          ...componentId,
        }
      : null;
  }
  const text = textOf(message.content).trim();
  if (!text) {
    return null;
  }
  const parsed = parseContainer(text);
  return parsed
    ? { kind: 'content', value: parsed.value, ...componentId }
    : null;
}

/** The answer as a fenced YAML code block, for the chat's markdown renderer. */
export function structuredOutputToYamlBlock(value: unknown): string {
  const yaml = stringify(value, { lineWidth: 0 }).trimEnd();
  // Longer than any backtick run in the YAML, so a string value cannot close the block.
  const longestRun = Math.max(
    0,
    ...(yaml.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}yaml\n${yaml}\n${fence}`;
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line