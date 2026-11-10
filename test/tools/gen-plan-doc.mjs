#!/usr/bin/env node
/**
 * pnpm gen:plan-doc — writes src/utils/buildDocs/plan.ts (the Design tab "תוכנית") from
 * memories/files/BUILDER_PLAN-full.md, word for word. Run it after every edit of the plan; never edit plan.ts by hand.
 * Lives under test/ because the platform keeps only src/** and test/** (scripts/ does not survive publishing).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(root, 'memories/files/BUILDER_PLAN-full.md');
const OUT = join(root, 'src/utils/buildDocs/plan.ts');

const markdown = readFileSync(SRC, 'utf8');
const header = `/**
 * GENERATED from memories/files/BUILDER_PLAN-full.md — do not edit by hand. Regenerate with pnpm gen:plan-doc
 * (test/tools/gen-plan-doc.mjs) after every edit of that file (the full plan, shown in the Design page tab "תוכנית").
 */
`;
writeFileSync(OUT, `${header}export const PLAN_MARKDOWN = ${JSON.stringify(markdown)};\n`);
console.log(`plan.ts: ${markdown.split('\n').length} lines from BUILDER_PLAN-full.md`);