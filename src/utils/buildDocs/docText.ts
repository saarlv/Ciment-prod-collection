/**
 * The shared shape of the text-first Design docs (04 · פניות, סוכנים): sections of paragraphs, lists, numbered steps
 * and tables, copied word for word from their .md source. Inline `**bold**` and `code` are kept as written and
 * rendered by RichText (src/components/build/DesignParts.tsx).
 */

/** A list item: plain text, or text with sub-points (bulleted, or numbered when `ordered`) and a paragraph after them. */
export type DocItem = string | { text: string; sub?: string[]; ordered?: boolean; after?: string };

export type DocBlock =
  | { type: 'p'; text: string }
  /** A `###` sub-heading inside a section (e.g. one per table of a schema section). */
  | { type: 'h3'; text: string }
  | { type: 'list'; items: DocItem[] }
  | { type: 'steps'; items: DocItem[] }
  | { type: 'table'; head: string[]; rows: string[][] };

export interface DocSection {
  title: string;
  blocks: DocBlock[];
}

export interface TextDoc {
  /** The component number ("04"); a cross-component doc has none. */
  number?: string;
  title: string;
  date: string;
  lead: string;
  /** The pointer to the sync doc, after the bold "סנכרון עם Priority:". */
  sync?: string;
  tags: string[];
  sections: DocSection[];
}