# Skill Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating/updating/deleting a skill.

A skill is a single reusable **SKILL.md** (markdown, one file — not the multi-file `skill-creator` package format) that an [agent](../agents/agents.md) can invoke. Define each as `artifacts/skills/<name>.json` — e.g. `InvoiceExtractor.json`, the filename matching the `name` inside the JSON. After changes, run **`pnpm gen:types`**.

Existing skills are already in `artifacts/skills/`: read them first and edit the one whose job matches rather than adding an overlapping skill. A skill only does anything if an agent references it — see [agents.md § Skills](../agents/agents.md#skills) for wiring `name` into an agent's `skills` array.

## `name` — stable functional identifier

`name` is a **stable identifier that must never be modified once the skill exists**. It is the artifact filename and the value agents use to reference this skill from their `skills` array.

- **Never rename an existing skill.** To update one, keep `name` and the filename exactly as-is and edit `title`/`description`/`content`. Changing `name` is not a rename: it is treated as deleting the old skill and creating a new one, breaking every agent reference to it.
- `name` is also slugified into the SKILL.md frontmatter `name:` field on sync — pick something that reads well slugified (e.g. `InvoiceExtractor` → `invoice-extractor`).

## `description` — drives triggering

`description` is the one-line summary written into the SKILL.md frontmatter, and the only thing the agent runtime uses to decide **when** to invoke this skill among the others it has. Say what the skill does and the concrete situation that should trigger it (what request, what data, what task), not a restatement of the title — for example "Approves refunds over ₪500 (order check, finance sign-off). Use when a customer asks for a refund over ₪500." A generic description means the skill either never fires or fires on the wrong turns.

## `content` — the SKILL.md body

`content` is the markdown body the agent follows once the skill is invoked, and the only part of the artifact it reads at runtime. Do not include a frontmatter block in `content`: the slugified `name:` and `description:` are added on sync, and existing frontmatter is normalized rather than duplicated.

## Skill or instructions

An agent reads its `instructions` on every turn and a skill only when the skill's `description` matches the situation, so place each piece of knowledge by when it applies:

- **Instructions** hold what applies in every conversation: the agent's role, tone and standing rules — for example "answer in the customer's language".
- **A skill** holds a procedure or body of knowledge needed only in one recognizable situation — for example the steps for approving a large refund.
- Situational material already in the instructions moves into a skill, and leaves the instructions in the same change.
- A change about a situation an existing skill covers goes into that skill; a new skill is for a situation no skill covers yet.

## JSON schema

```json
{
  "type": "object",
  "required": ["name", "content"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Stable functional identifier. Never changes. Also the artifact filename. Slugified into the SKILL.md frontmatter `name:`. Referenced from an agent's `skills` array."
    },
    "title": {
      "type": "string",
      "description": "Display title. Defaults to `name` when omitted. Becomes the skill block name/title."
    },
    "description": {
      "type": "string",
      "description": "One-line description written into SKILL.md frontmatter. Drives skill triggering — keep it specific to the situation that should invoke this skill."
    },
    "content": {
      "type": "string",
      "description": "The SKILL.md body (markdown). Frontmatter is added automatically on sync — do not write your own."
    }
  }
}
```

## Fields you don't author

- **`skillBlockId`** — present only on files seeded back from an existing app, as the durable round-trip identity sync matches on. Never author or invent it for a new skill: a wrong value hijacks and overwrites an unrelated existing skill on sync. Leave it out entirely when creating a skill; leave it exactly as-is on a seeded file.
- **A doc-file / uploaded-file block.** A skill here is the `skill_instance` block only — there is no companion document upload.

## Update & delete

- **Create:** only when no existing skill fits. Pick a stable `name` (same value as the artifact filename).
- **Update:** write the artifact with the **same `name`** as an existing skill → updated in place. Keep `name` and the filename unchanged.
- **Delete:** remove the artifact file from `artifacts/skills/` to delete the skill on sync, and remove its `name` from any agent's `skills` array. Never delete-and-recreate to rename — that loses history and breaks every agent reference.

After any skill change, run **`pnpm gen:types`**.
