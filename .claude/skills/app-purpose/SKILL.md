---
name: app-purpose
description: Whether this app is a customer DEMO (built fast to show the end-to-end use case, on sample data, with simulated inbound traffic and a reset page) or a PRODUCTION app (the app the customer runs their business on, built as every app is built today). Load it when you plan a new app or a customer solution, when the user says "demo", "POC", "showcase", "for the customer meeting", "production", "go live" or "connect it to their real systems", and whenever `memories/STORY.md` records an app purpose, so the build follows that purpose's rules.
user-invocable: false
---

# App purpose: demo or production

The same platform builds two very different things for a customer, and the right build for one is
the wrong build for the other:

- **Demo**: built in one or two turns to show the customer their use case working end to end,
  before the app is connected to their systems. It runs on sample data (often from files they
  sent), simulates the inbound traffic (an email arriving, a supplier replying), and has to start
  from scratch again before every showing. The logic is deep enough to show the main agents doing
  real work, and no deeper.
- **Production**: the app the customer runs their business on, connected to their real systems.
  It is built the way every app is built today, by the rest of the platform guidance.

**Production is the default.** An app is a demo only when the request makes that clear (in words or
by its tells) or the user picks it when you ask. Every other app, including one whose purpose was
never recorded, is a production app: build it as you would without this skill.

## Guides in this skill

| Guide           | Read it when                                                                    |
| --------------- | ------------------------------------------------------------------------------- |
| `demo.md`       | The app purpose is demo: the demo control page, sample data, simulation, scope. |
| `production.md` | The app purpose is production: any production-specific rules collected so far.  |

## 1. Decide the purpose

Read `memories/STORY.md` first: a `**App purpose:**` line there is the decision, already made. Keep
it unless the user changes it.

Otherwise, look for the tells:

| Demo                                                                         | Production                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "demo", "POC", "showcase", "for the meeting on Tuesday", "show the customer" | "go live", "roll out", "our team will use it daily", "replace our process"  |
| sample files, "dummy data", "make up some customers"                         | credentials, real mailboxes, "connect it to NetSuite / our ERP / our inbox" |
| a deadline in days, "quick", "just enough to show"                           | volumes, SLAs, permissions, audit, "what happens when X changes"            |

When the request makes the purpose clear, decide it yourself and don't ask: the user said it, or
the tells all point one way ("meeting Thursday… make up the customers… convincing enough" is a demo;
"our team uses it daily from next month" is production). Ask only when the request is genuinely
ambiguous (tells on both sides, or a customer solution with none), as the first question of your
first `ask_user_question` round (the `plan` skill's step 3), because the answer changes every other
one: what discovery goes deep on, the data, the agents' depth, the evals. Recommend the purpose the
tells lean toward; with no tells, recommend production. A small app someone builds for their own
business is production without asking.

A demo that won the deal becomes production. When the user asks for that ("they signed, let's take
it live"), it is a production plan: plan the move as changes to the existing app (which
simulations are replaced by real connections, which sample data gives way to theirs), and remove
the demo control page and its actions last, once nothing depends on them.

## 2. Record it

- In the plan: under **Understanding**, as `**You said:**` only when the user stated it or picked it
  in a round; when you read it from the tells, as `**I assumed:**` with the tells that decided it
  ("demo — a meeting on Thursday and made-up data"), so a wrong call is easy to correct; and as the
  first bullet under **Decisions**, with what the other purpose would have built instead.
- In `memories/STORY.md`, near the top: `**App purpose:** demo` or `**App purpose:** production`, with
  the date and one line on why ("demo for Acme's ops review on 3 Nov; real ERP comes later"). Every
  later turn reads it there, so write it the turn the purpose is decided, plan or no plan.
- In every subagent brief, as an `APP PURPOSE:` line (the orchestrator's brief template carries it).
  Subagents start cold, so a purpose missing from the brief is one they never apply; write
  `production` when nothing records one.

## 3. Build for that purpose

Read the purpose's guide before you write the plan's Data, Pages & UI and Agents sections, and again
before you build. For a demo its rules change what "done" means; nothing in the guides relaxes the
platform rules (artifact schemas, tenant scoping, human approval before a step that sends, pays or deletes).
