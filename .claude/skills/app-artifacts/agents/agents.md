# Agent Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating/updating/deleting an agent.

An agent is a reusable AI persona, invoked from a **SendAgentMessage** DAG node or attached to an agent-chat. Define each as `artifacts/agents/<Name>.json` — the filename matches the functional `name` inside the JSON, e.g. `SupportAgent.json`. After changes, run **`pnpm gen:types`**.

> **An agent people come to converse with must be declared as a mini-app.** Creating the JSON is not enough: it also gets an agent mini-app in `artifacts/app.json` ([app](../app/app.md) — which also says when an agent is only an embedded chat) plus its [agent-chat](../agent-chats/agent-chats.md) artifacts, one per surface — all in the same turn you create the agent, or the app's users have no way to reach it. Sub-agents and internal task agents (invoked only from actions, workflows, or another agent) get neither.

> **Creating or substantially reworking an agent? Load the `agent-builder` skill first** — even if you are already here with `app-artifacts` loaded. This doc gives you the _shape_ of the JSON. `agent-builder` runs the short discovery interview that decides the instructions, tools, and evals, so the agent reflects what the user actually needs rather than the pattern of the agents already in the app.

## Reuse the existing agent before creating one

The app's current agents are already seeded into `artifacts/agents/` (with their persona `title`) and are also returned by app describe. Read them first and edit the one whose job matches: a second agent overlapping an existing one leaves a duplicate, splits history and references, and burns another persona from the catalog.

**Users name agents by their persona `title`, not the functional `name`.** In the app UI the user sees the persona display name ("Ron", "Stella"), not the artifact `name` (`APOpsAgent`, `CardOpsAgent`). So "the Ron agent", "use Ron", or "the Ron chat" means _the existing agent whose `title` (or `jobTitle`) is "Ron"_ — scan `artifacts/agents/*.json` for that `title`/`jobTitle` and edit that agent in place. A new `RonAssistant` is how you end up with a duplicate agent and a mismatched persona.

Each persona belongs to **at most one agent per app**: if the persona the user asks for is already used by an existing agent, that agent is that persona — reuse it. Deleting an agent to recreate it loses its history and breaks every reference.

## `name` — stable functional identifier

`name` is a **stable identifier that must never be modified once the agent exists**: a functional, role-based PascalCase name describing what the agent does — `SupportAgent`, `SalesRepresentative`, `OnboardingGuide`. Never a persona or person name.

- It is the artifact filename and the value used for cross-referencing from agent-chats, DAG nodes (`agentBlockId`), and `editAgent`.
- **Never rename an existing agent.** Changing `name` is not a rename: it is treated as deleting the old agent and creating a new one, so you lose its history and break every reference (agent-chats, DAG `agentBlockId`, subagents, and any phone line pointed at it — whose agent binding cannot be repaired without giving up its number). If the user asks to "rename" an agent, change its display via other fields (e.g. `jobTitle`).

## Personas — pick one from the catalog

`personas.json` (same folder as this doc) is the fixed persona catalog: `{ title, gender, photoUrl, avatarUrl }`. `title` is the persona display name users see in the app; personas and image URLs cannot be invented. When creating an agent:

1. Read `personas.json` and the `title` fields of existing `artifacts/agents/*.json`.
2. Pick a persona **not already used** by another agent in this app (if every persona is taken, reuse the least-used one). Honor explicit user preferences (a specific persona name or gender); otherwise vary your pick — don't always take the first entry.
3. Copy `title`, `photoUrl`, and `avatarUrl` **exactly** into the artifact. The exact `title` spelling (or, for a renamed persona, the exact `photoUrl`) is what links the persona's voice and intro video on sync.

**Match gender to the name.** When the user gives the agent a name ("an agent called Sarah", "make David the support agent"), the persona must fit it:

- The name is in the catalog → that persona (its `gender` already fits).
- The name is not in the catalog → pick an unused catalog persona whose `gender` matches the gender the name implies, copy its `photoUrl` and `avatarUrl` exactly, and set `title` to the user's name instead of the persona's. Sync keeps that persona's photo, voice and gender under the new name. Never pick a persona of the other gender.
- The user asks for a gender without a name ("a female agent") → pick an unused persona whose `gender` matches.

**Pick the gender silently.** Inferring it from a name or the request is your call: just pick, and never tell the user which gender you picked or why ("I made Sarah female", "since Dana is usually a woman's name…"). Ask only when the name is truly unisex (Alex, Noa, Sam, Jordan, Dana) and nothing else in the request implies a gender — e.g. "Should Alex be a man or a woman?", asked in the current round of questions if one is open, otherwise as one short question.

The agent knows its own gender: its persona's gender is in its system prompt at run time, so instructions don't need to restate it — but never write instructions that contradict it (a "Sarah" told to speak as a man).

## Changing an existing agent's persona or image

Persona fields (`title`, `photoUrl`, `avatarUrl`) are set at creation. On an existing agent **leave them exactly as seeded** — even when they don't match the catalog, since the user may have renamed the agent or uploaded a custom image in the platform UI — except in the two cases below, and only when the user asks.

**Switching gender.** The user asks for the other gender ("make it a man", "I want a female agent"), or renames the agent to a name of the other gender ("call her David"):

1. Pick a catalog persona of the new gender **not already used** by another agent in this app.
2. Copy its `photoUrl` and `avatarUrl` exactly. Set `title` to the name the user gave; with no name, to the new persona's `title`.
3. Keep `name`, the filename and everything else unchanged — this is an update in place, never a delete-and-recreate.

Sync sees the new `photoUrl` and swaps the whole persona: photo, avatar, intro video, voice and gender. Renaming within the same gender ("call him Dan" for a male agent) changes only `title`. Asking for a different persona of the same gender, or a specific catalog persona by name, works the same way.

**Using an image the user attached.** When the user attaches an image in the chat and asks to use it as an agent's picture ("use this as Ron's photo", "make this the agent's avatar"), set both `photoUrl` and `avatarUrl` to that file's **original URL** from the user-files listing — copied exactly, never the local `user-files/` path (the app can reach an attached file only by that URL). Keep `title` and everything else unchanged; sync sets the photo, and the agent keeps its voice and gender. Do this only when the user asked for it: an image attached for other reasons (a logo, a screenshot, a design reference) is never an agent's picture. If the user attached several images and it isn't clear which one they mean, ask.

## JSON schema

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Stable functional identifier (PascalCase role name, e.g. \"SupportAgent\", \"SalesRepresentative\"). Never changes. Also the artifact filename. Used for cross-referencing from agent-chats / DAG nodes / editAgent."
    },
    "title": {
      "type": "string",
      "description": "Persona display name — on create, copy exactly from personas.json (see \"Personas\"). Keep unchanged on existing agents unless the user asks to rename, switch gender or switch persona."
    },
    "photoUrl": {
      "type": "string",
      "description": "Persona photo URL — copy from the picked personas.json entry, or the original URL of an image the user attached for this agent's picture. Changing it on an existing agent switches its look (see \"Changing an existing agent's persona or image\")"
    },
    "avatarUrl": {
      "type": "string",
      "description": "Persona avatar URL — copy from the picked personas.json entry; for an attached image, the same URL as photoUrl. Sync derives the avatar from photoUrl: changing avatarUrl alone changes nothing"
    },
    "instructions": {
      "type": "string",
      "description": "System / persona instructions describing behavior and goals"
    },
    "jobTitle": {
      "type": "string",
      "description": "Short role title, e.g. \"Support Specialist\""
    },
    "memoryEnabled": {
      "type": "boolean",
      "description": "Long-term memory"
    },
    "skillBlockIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Skill instance block ids. Legacy/back-compat — prefer `skills` (below) when referencing skill artifacts by name."
    },
    "skills": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Names of skill artifacts (artifacts/skills/<name>.json) this agent uses. Sync resolves each name to its skill_instance block id and wires it onto the agent (skillBlockIds + skillInstances) — do not hand-resolve or invent block ids."
    },
    "subAgentBlockIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Agent block ids to use as subagents"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["actionTypeId"],
        "properties": {
          "actionTypeId": {
            "type": "string",
            "description": "Action tool type id from ListActions / app describe"
          },
          "managedByChannelId": {
            "type": "string",
            "description": "READ-ONLY, seeded. Set on a tool a communication channel attached (e.g. a WhatsApp channel's hidden send-message tool). This entry is channel infrastructure, not an authored tool: carry it through UNCHANGED, never remove it, and never author the field yourself. Sync preserves marked tools from the live agent regardless of the artifact."
          },
          "hidden": {
            "type": "boolean",
            "description": "READ-ONLY, seeded. Channel-managed tools are hidden from the Tools UI."
          }
        }
      }
    },
    "knowledge": {
      "type": "array",
      "items": { "type": "object" },
      "description": "Context entries stored on the agent (e.g. { url } or { dataBlockId })"
    },
    "evalGoldens": {
      "type": "array",
      "description": "Agent evals test cases (goldens) to test the agent's runs. Ground each golden in a real requirement or a provided sample — never invent free-floating cases.",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Human-readable name for the test case."
          },
          "prompt": {
            "type": "string",
            "description": "The prompt/input given to the agent for this case."
          },
          "expected_extracted_data": {
            "type": "string",
            "description": "The expected result / golden answer the agent's output is judged against."
          },
          "files": {
            "type": "array",
            "items": { "type": "object" },
            "description": "Sample file attachments for the case (each { dataBlockId?, url?, fileName? }); the agent and judge can fetch them."
          },
          "expected_tools": {
            "type": "array",
            "description": "Tool calls this case expects, scored by a 'tool_correctness' metric. actionBlockId must be one of THIS agent's tools[].actionTypeId values, copied exactly, or the same artifact:action:<Name> ref used in tools — never a sub-agent, never a typed tool name. Sync rejects anything else, and the whole agent save fails.",
            "items": {
              "type": "object",
              "required": ["actionBlockId"],
              "properties": {
                "actionBlockId": { "type": "string" },
                "input_parameters": {
                  "type": "object",
                  "additionalProperties": { "type": "string" },
                  "description": "Inputs the call must use, keyed by the tool's input name. Only the inputs named here are checked, each exactly; anything else the call sends (a tableBlockId, a limit) is ignored. Write plain values: each is read as the type the tool's input schema gives that input, so for a text input `42` is the text 42, and for a number, boolean, object or array input it is JSON (`42`, `true`, `{\"value\": \"Work\", \"column\": \"name\"}`)."
                }
              }
            }
          },
          "expected_tools_ordering": {
            "type": "string",
            "enum": ["any", "in_order"],
            "default": "any"
          }
        }
      }
    },
    "evalMetrics": {
      "type": "array",
      "description": "Agent evals metrics. type 'geval' (LLM-judge criteria), 'score_agreement' (the agent's own self-reported numeric score vs an independent judge's) or 'tool_correctness' (the expected tool calls).",
      "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["geval", "score_agreement", "tool_correctness"],
            "description": "Metric variant. geval = LLM-judge against criteria; use for verifying extracted values, dates, and any qualitative judgment (set compareToExpected to judge against the golden's expected_extracted_data). score_agreement = checks that a numeric score the agent emits about itself (e.g. a confidence or quality field) agrees with an independent judge's score — NOT for checking an extracted value. tool_correctness = the Tool calls check — scores each golden's expected_tools; a golden without them shows Not set and doesn't count. Only name applies. See 'Evals' below for how metrics and goldens combine."
          },
          "name": {
            "type": "string",
            "description": "Display name for the metric."
          },
          "criteria": {
            "type": "string",
            "description": "[geval] The judge criteria the agent's output is evaluated against."
          },
          "threshold": {
            "type": "number",
            "description": "[geval] Pass threshold, 0-1."
          },
          "compareToExpected": {
            "type": "boolean",
            "description": "[geval] Include the golden's expected_extracted_data in the judge's comparison (the way to verify an extracted value against a known answer)."
          },
          "score_field": {
            "type": "string",
            "description": "[score_agreement] The field in the agent's structured output that holds its self-reported numeric score (e.g. confidence, quality)."
          },
          "score_scale": {
            "type": "array",
            "items": { "type": "number" },
            "description": "[score_agreement] [min, max] range of that score (defaults to [0, 1])."
          },
          "scoring_rubric": {
            "type": "string",
            "description": "[score_agreement] How the judge should independently re-score the output."
          },
          "tolerance": {
            "type": "number",
            "description": "[score_agreement] Allowed gap between the agent's score and the judge's for them to still count as agreeing."
          }
        }
      }
    },
    "adminRoles": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Role names (exactly as in the role artifacts) whose users are this agent's admins. Builders are always admins. Omit or [] = every signed-in user is an admin. See 'Admins' below."
    },
    "allowSelfScheduling": {
      "type": "boolean",
      "description": "Set on the agent page. Omit to keep the stored value; never change it unless a skill tells you to."
    },
    "allowNotifications": {
      "type": "boolean",
      "description": "Set on the agent page. Omit to keep the stored value; never change it unless this doc tells you to."
    }
  }
}
```

## Evals (`evalGoldens` / `evalMetrics`)

`evalGoldens` are test cases (a prompt + expected data, plus optional sample files and expected tool calls); `evalMetrics` are `geval` (LLM-judge criteria), `score_agreement` (checks a numeric score the agent emits about itself against an independent judge) or `tool_correctness` (the expected tool calls) definitions. To verify an extracted value (a total, a date, a field), use `geval` with `compareToExpected` — not `score_agreement`. Ground every golden in a real requirement or a provided sample — never invent free-floating cases. These sync to `block.data.evalGoldens` / `evalMetrics` and are runnable from the Evals panel. On edit they are preserved unless you include them (omit ⇒ existing evals kept).

**Every metric is scored against every golden.** There is no way to attach a metric to a subset of the cases, so a metric like "gives good logistics advice" also runs on an adversarial golden where the right behavior is to give no answer at all (an off-topic refusal, a decline) — and fails there. Write each metric's `criteria` with its own applicability gate so it passes when it doesn't apply, e.g. "If the request is outside the agent's scope, a refusal passes this metric."

**Tool calls (`tool_correctness`)** scores whether the agent called each golden's `expected_tools` — the exception to the rule above: a golden without them shows Not set and doesn't count. `actionBlockId` takes the tool's `actionTypeId` (the names differ; the value is the same). Only the inputs set in an expected tool's `input_parameters` are checked, each exactly and read as the type the tool's input schema gives it; anything else the call sends is ignored, and an expected tool without `input_parameters` matches any call to it.

## Admins (`adminRoles`)

`adminRoles` lists the **role names** whose users are this agent's admins — each must match a role artifact's `name` exactly (case-sensitive). Agent admins get the admin chat experience (feedback, the admin tools) in this agent's chats that have `"isAdmin": true`; everyone else gets the plain chat there. Users with build permission are always admins. Omit it or leave it `[]` and every signed-in user is an admin. It is also editable on the agent page, so keep a seeded value unless the user asks to change it; omitting the key leaves the stored value as is, and `[]` clears it.

When the agent should follow up later on its own (reminders, recurring check-ins), read the `runtime-schedules` skill: it covers `allowSelfScheduling`.

## Skills

Reference a skill by its `name` in this agent's `skills` array (e.g. `"skills": ["InvoiceExtractor"]`); sync creates/updates the matching `artifacts/skills/<name>.json` into a skill_instance block and wires its resolved block id onto this agent (`skillBlockIds` + `skillInstances`). Don't author or guess a skill's block id; that lives only in the skill artifact itself (`skillBlockId`, seeded on read-back). At runtime the agent only ever reads the skill's `content` (the SKILL.md body). Schema: [skills](../skills/skills.md).

## `communicationChannels` — mailboxes and phone lines

An agent may carry a `communicationChannels` object: the ways to reach it, grouped by kind. Channels are stored on the agent, so they live here rather than in a directory of their own. Three kinds today, each with its own rules — **do not author any of them from this doc**:

- **`communicationChannels.email`** — mailboxes the agent answers. Load `app-email-channels` before writing one; the mailbox has to be connected to the account first, which that skill covers.
- **`communicationChannels.voice`** — phone numbers callers dial. **Each voice entry is a real, paid phone number.** Only the `app-voice-channels` skill may author these, and only when that skill is loaded (phone lines are enabled per account). If it is not among your skills, this app has no phone lines and you must never add the key.
- **`communicationChannels.whatsapp`** — WhatsApp Business numbers the agent answers. Only the `app-whatsapp-channels` skill may author these, and only when that skill is loaded (WhatsApp channels are enabled per account). If it is not among your skills, this app has no WhatsApp channels: carry any seeded entries through unchanged and never add the key.

If you see any of these on a seeded agent, carry it through unchanged: dropping a voice entry releases the number for good, dropping an email entry stops the agent answering that mailbox, and dropping a WhatsApp entry stops the agent answering that number. The kinds are independent — writing one key says nothing about the other, and none is removed by an artifact that simply does not mention it.

**A channel owns part of the agent and part of the app — do not rebuild either:**

- The agent's `tools` entries marked `managedByChannelId` are the channel's own hidden tools (a WhatsApp channel's send-message tool, a voice channel's outbound-call tool, a mail channel's reply tools). They are the ONLY supported way the agent replies on that channel. Never remove one, and never replace it by wiring your own send node/workflow for that channel — sync preserves marked tools from the live agent regardless, so removing them from the artifact only makes the file lie about the block.
- The workflow and trigger blocks a channel provisioned (its inbound wiring) belong to the channel. Do not rewrite, re-route, or delete them when reworking the agent or its workflows.

## Task agents (`agentKind`, `iconName`)

A step inside another agent's job is always a task agent, never a second user-facing agent (`agentic-apps` step 1). Build a **task agent** only when no person will ever talk to the agent: only workflows or other agents (as a sub-agent) call it. In any doubt, build a user-facing agent; decide this yourself, never ask the user. If people email it or it replies to them, it's user-facing; if a workflow reads the inbox and hands it the content, it can be a task agent. Write it with `agentKind: "task"` and a functional `title` ("Invoice Extractor"), never one from `personas.json`. Give it an `iconName` (a Lucide icon matching its job, e.g. `receipt`) and a `jobTitle` that is one sentence on when to call it and what it returns. Leave out `photoUrl`, `avatarUrl` and `communicationChannels`, and never give it an agent chat, mini-app or layout. To switch an existing agent, only when the user asks:

- Set `agentKind: "task"` to make it a task agent. Sync refuses while it has a chat or channel; tell the user to disconnect them, and never remove them yourself.
- Set `agentKind: "user-facing"` with a persona's `photoUrl` and `avatarUrl` to switch it back.

Otherwise leave `agentKind` out: an agent file without it keeps its kind.

When the user asks for approval before the agent runs a tool (or to stop asking for one), read the `agent-tool-approval` skill first: it covers `askBeforeRunning` and `tools[].approval`.

## Update & delete

- **Create:** only when no existing agent fits (reuse first). Pick a stable functional `name` (same value as the artifact filename) and a persona from `personas.json` (`title` + `photoUrl` + `avatarUrl`; a custom name replaces only `title`).
- **Update:** write the artifact with the **same `name`** as an existing agent → updated in place (editAgent). This is the right tool for "change the Ron agent", "give the agent these tools", "point the chat at Ron". Keep `name`, the filename, any existing `title`, `photoUrl` and `avatarUrl` (unless the user asked for a new gender, persona, name or picture — see "Changing an existing agent's persona or image") — and any existing `communicationChannels` — unchanged. If the agent's file already has `askBeforeRunning`, or a tool in it already has `approval`, keep each exactly as it is when you rewrite the file: never drop, add or change them. Likewise keep a `harness` the file already has exactly as it is, and never add one: it marks an older agent whose chat still holds part of its instructions and tools.
- **Delete:** remove the artifact file from `artifacts/agents/` to delete the agent on sync. Never delete-and-recreate to rename, re-skin, or change a persona or gender (see "Changing an existing agent's persona or image") — that loses history, breaks references, and releases any phone number the agent answered on.

After any agent change, run **`pnpm gen:types`**. This exports `<Name>Agent` from `src/product-types.ts` — when the UI shows the agent (profile card, chat header, team list, agent mini-app), tell the frontend agent to read its identity with `useAgent(<Name>Agent)` (`title`, `jobTitle`, photos; see the `blocks-client` skill), never hardcoded names or placeholder avatars.
