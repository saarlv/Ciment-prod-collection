# App Metadata Artifact

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before setting the app's name, description, or mini-apps.

`artifacts/app.json` sets the **app's own name, description, and mini-apps**. It is a singleton — one file at the root of `artifacts/`, not a directory — and update-only: the app always already exists, so there is no create or delete, only `updateApp`. The file is **pre-seeded** from the live app (name, description, and mini-apps from blocks-store), so read it first rather than recreating it.

**Required for new apps:** when the seeded file still has a default placeholder name (`"New App"`, `"Untitled"`) or no description, set both — this is what the user sees in their app list and on the app's own header:

- `name` — a short, specific, user-friendly app name. Use the name the user gave; otherwise derive one from what the app does (e.g. "Inventory Tracker", not "New App" or "My App").
- `description` — one sentence describing what the app does, written for the app's users.

For existing apps, update in place when the user asks to name, rename, retitle, or (re)describe the app.

## Mini-apps — one shell per use case

`miniApps` declares the app's mini-apps. **A mini-app is one shell serving one use case** — with its own layout and nav, its own pages over the app's data, mounted at its own first-level entry route. What separates one use case from another is a different **purpose**, **job**, or **audience**: a booking flow vs. the studio that runs it, a customer portal vs. the team's desk. Each pair is two shells because different people arrive for different reasons; the same people in the same sitting are one mini-app, however many screens (shipments, carriers, reports are pages, not three mini-apps). A role is one way an audience shows up, not the definition — a mini-app is just as often for anyone signed in.

This is the **single definition** of a mini-app — every other instruction points here — and **the schema below is the contract: its `required`, `additionalProperties`, and field descriptions ARE the rules; don't guess beyond them.** Two kinds, told apart by `agent`:

- **Page mini-app** — `{entryRoute, icon, label}`: a general-purpose interface for one purpose, job, or audience, described by its own icon and label.
- **Agent mini-app** — `{entryRoute, agent}`: the agent is the use case — a conversations shell (every conversation anyone had with the agent, a new chat, the agent's persona) plus the agent's pages: its work board and item deep dive (the `agentic-apps` skill). Icon and label come from the agent's persona. Who sees the shell is the agent's owner role (`agentic-apps` step 5) — `roles` below for the shell, the app's code for the rest. Every user-facing agent has exactly one; a screen that needs AI help but owns no job (a listing helper in the listing editor) uses an AI action, or a plain chat with the agent whose job it is.

The declaration is structure: the platform's rail renders it (agent rows first), the app's code doesn't. The workflow around it:

- **You decide the mini-apps — page and agent alike.** How many there are, what each is called, and the URL each mounts at follow from what **this** app needs — never from a stock pattern or the role list. Think in routes, never in page names or files — the frontend agent builds a route tree at exactly each declared route.
- **The frontend agent never edits this file.** It builds routes from your brief — `ENTRY ROUTES` (the routes) and `MINI-APPS` (what each is for, in prose; both in `CLAUDE.md`) — and reads the declaration only when a brief omits `ENTRY ROUTES`; so every brief that touches pages or routing lists exactly these mini-apps, and when its report says the structure had to deviate, update the declaration.
- **Keep it in sync, in the same turn.** Every new app declares at least one mini-app before your turn ends (an existing app with none declares them on the first turn that touches its pages), and any turn that adds, removes, or re-mounts a mini-app (or points one at a different agent) updates the declaration in that turn. A stale entry fails silently — nothing errors, the route just leads nowhere and the rail shows no row for it.

### Where the app opens, and how mini-apps relate

- **Opening.** Array order decides (schema). In a public app the anonymous visitors' mini-app comes first, and it is a **page** mini-app — the root never opens on an agent mini-app while a page one exists. Each viewer opens on the first page mini-app **they** are shown (see `roles`).
- **A mini-app meant for some roles only** sets `roles` — app role names, exactly as in `artifacts/roles/<Name>.json` — and its layout guards it, **both from the same role list**. `roles` decides what the platform shows: the rail, where the app opens, the mobile tabs list it only for those roles (builders see every mini-app). The layout decides what the app renders: a direct URL still opens the mini-app, so its `layout.tsx` keeps denying everyone else in place (the `roles-and-authentication` skill) — hiding is not access control. Say who and why in the brief's `MINI-APPS` paragraph too, so the frontend writes that guard. Omit `roles` for a mini-app every signed-in user gets; never set it to every role. Not the agent's `adminRoles`: that decides who gets the admin chat _inside_ an agent mini-app, `roles` who sees the mini-app at all.
- **Mini-apps link like apps.** They never share a shell; one links into another wherever that suits the flow (the `app-layout` skill). A copy of a screen is built only for people kept out of the mini-app that has it (a portal's customers).

### Deciding an agent mini-app

What an agent mini-app holds — its work board and item deep dive, that it opens on the board, which screens are the agent's and which are interfaces, who uses it — is the `agentic-apps` skill's decision (steps 3–5), made on every build and carried to the frontend only through the brief's `MINI-APPS` paragraph: plain words, what and why, never a role list or a path list. Never a page with nothing real behind it, never metrics the app doesn't store, never an invented role.

## JSON schema

```json
{
  "type": "object",
  "$defs": {
    "miniAppRoles": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true,
      "items": { "type": "string", "minLength": 1, "maxLength": 100 },
      "description": "Optional, on either kind. The app roles this mini-app is meant for — role names exactly as in artifacts/roles/<Name>.json. The platform lists the mini-app (rail, landing, mobile tabs) only for users with one of these roles; builders see every mini-app. Omit for a mini-app every user gets; never []. Visibility only — the mini-app's layout.tsx still guards it, from the same list"
    }
  },
  "properties": {
    "name": { "type": "string", "description": "The app's display name" },
    "description": {
      "type": "string",
      "description": "Short, user-friendly description of what the app does"
    },
    "miniApps": {
      "type": "array",
      "maxItems": 50,
      "description": "The app's mini-apps — every item one shell serving one use case, general or agent-oriented — in order: the app opens on the first page mini-app (with none declared, the first agent mini-app). entryRoute is unique across the array (all mini-apps share one URL space). A write REPLACES the whole array — always re-list every mini-app; an empty array clears all.",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "description": "Page mini-app — a general-purpose interface: a route tree serving one purpose, job, or audience. The app serves entryRoute and everything under it",
            "required": ["entryRoute", "icon", "label"],
            "properties": {
              "entryRoute": {
                "type": "string",
                "maxLength": 100,
                "description": "Entry route — exactly ONE path segment written with its leading slash (\"/admin\"), short, lowercase, named for the mini-app's purpose. Never nested: /admin/reports is an inner page of /admin reached from inside it, not a mini-app. \"/\" only when this is the app's only mini-app (and then prefer it); with two or more, the root is not a mini-app"
              },
              "icon": {
                "type": "string",
                "maxLength": 100,
                "description": "Lucide icon name (kebab-case), e.g. \"layout-dashboard\". Display metadata on the declaration — nothing in the app's code reads or renders it"
              },
              "label": {
                "type": "string",
                "maxLength": 100,
                "description": "The mini-app's short user-facing name, 1–2 words (\"Admin\", \"Client Portal\"). Display metadata, like the app's own name/description"
              },
              "roles": { "$ref": "#/$defs/miniAppRoles" }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "description": "Agent mini-app — an interface the app serves at entryRoute, centered on one agent: the agent's conversations shell plus its work board and item deep dive (real, data-backed). No icon or label — both come from the agent's persona (avatar + title)",
            "required": ["entryRoute", "agent"],
            "properties": {
              "entryRoute": {
                "type": "string",
                "maxLength": 100,
                "description": "The agent's entry route — same one-segment, lowercase, unique rules as page entry routes; never \"/\", even in an agent-only app"
              },
              "agent": {
                "type": "string",
                "maxLength": 100,
                "description": "Agent artifact name — the stable functional identifier (\"SupportAgent\" for artifacts/agents/SupportAgent.json). Only a user-facing agent (see agents.md); sub-agents and internal agents never get a mini-app"
              },
              "roles": { "$ref": "#/$defs/miniAppRoles" }
            },
            "additionalProperties": false
          }
        ]
      }
    },
    "isPublic": {
      "type": "boolean",
      "readOnly": true,
      "description": "Read-only snapshot of whether the app is published publicly (Publish → Public). Not synced — set in Blocks App Settings, not here. Use it to decide when a custom login/signup page is appropriate (public apps only)."
    },
    "customDomain": {
      "type": "string",
      "readOnly": true,
      "description": "Read-only snapshot of the app's verified custom domain, as a bare hostname (e.g. \"orders.acme.com\"). Absent when the app has none. Not synced — connected in Blocks App Settings → Customization → Domains, not here."
    },
    "integrations": {
      "type": "array",
      "readOnly": true,
      "description": "Read-only snapshot of OAuth integrations already connected on the app (standalone/git-sync). Not synced — do not edit to add integrations.",
      "items": {
        "type": "object",
        "properties": {
          "provider": {
            "type": "string",
            "description": "Integration provider slug (e.g. gmail, slack)"
          }
        }
      }
    },
    "secrets": {
      "type": "array",
      "readOnly": true,
      "description": "Read-only snapshot of custom secret names already configured on the app. Not synced.",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Secret name (e.g. MY_API_KEY)"
          }
        }
      }
    }
  }
}
```

`name`, `description`, and `miniApps` are the writable fields, and all are optional for updates — an unset field leaves the stored value untouched (`updateApp`: `appName` / `appDescription` / `miniApps`); a present `miniApps` replaces the stored array (see the schema). Every field marked `"readOnly": true` above — **`isPublic`, `customDomain`, `integrations`, and `secrets`** — is a snapshot of the live app and is not synced: public/private is set in Blocks **App Settings → Publish**, the custom domain in **App Settings → Customization → Domains**, and integrations connect in **App Settings → Integrations**, so editing those fields here has no effect.

**`customDomain`:** the app's public address when it has one — use it to answer the user and in your briefs. Never hardcode it in the app's code (it can change or be removed): a code action that needs a full URL gets it at run time from `client.getAppLinks()` (backend-code-actions).

**`isPublic` and custom login pages:** a custom in-app, branded login/signup page is appropriate only when `isPublic` is `true` — public apps are opened by anonymous/external visitors who may need to sign up or sign in from the app itself, while private apps rely on the platform's built-in login (invited users only). When `isPublic` is `true` and the request involves sign-in or landing pages, load the **`public-app`** skill.

## Example

An app with two page mini-apps (the team's client records at `/clients`, a manual tool for its `Admin` role, and a client portal at `/portal`, meant for its `Client` role) and one agent mini-app at `/manager` for the `Admin` role, the agent's owner role — its work board holds the posts; the internal `PostWriterAgent` invoked by actions gets no mini-app. An `Admin` opens on the client records, a `Client` on the portal:

```json
{
  "name": "Social Media Command Center",
  "description": "Plan, schedule, and track posts across all your social channels in one place.",
  "miniApps": [
    {
      "entryRoute": "/clients",
      "icon": "contact",
      "label": "Clients",
      "roles": ["Admin"]
    },
    {
      "entryRoute": "/portal",
      "icon": "users",
      "label": "Client Portal",
      "roles": ["Client"]
    },
    {
      "entryRoute": "/manager",
      "agent": "SocialMediaManagerAgent",
      "roles": ["Admin"]
    }
  ]
}
```
