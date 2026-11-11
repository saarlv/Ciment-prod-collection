# Memory index
- memories/STORY.md — story of this app (Ciment Collections): decisions, evolution. Read at session start.
- memories/USECASE.md — collections (גבייה) domain knowledge for B2B building-materials distribution. Read before data model / agent / workflow design.
- memories/files/DESIGN.md — the approved "Liquid+" house style: CSS utilities, tokens, components, screen layout and rules. Read before ANY UI work and pass it to the frontend agent.
- memories/files/BUILDER_PLAN-full.md — THE master plan since 26.10 (revision 3): plan r2 (blocks 1–4, Iterations 4–8) merged with the receipts architecture (Iteration 9 + rounds 2–4), the replaced credit block, the sync strategy and a status-per-block table. Shown on the Design tab "תוכנית" (src/utils/buildDocs/plan.ts is generated from it by `node test/tools/gen-plan-doc.mjs` — run it after every edit; src change, so via the frontend agent) and as BUILDER_PLAN.md under the builder's plan button. Every change updates THIS file.
- memories/files/BUILDER_PLAN-r2.md — historical copy of the approved plan revision 2 (Iterations 4–8, incl. the column-by-column "Iteration 4a" spec). BUILDER_PLAN.md is no longer in the workspace; read this before building any iteration.
- memories/files/RECEIPTS_ARCHITECTURE.md — HISTORY: Iteration 9 receipts architecture (25.10: per-record ladder, remittance reader). Superseded: since 08.11 receipts are one flow identify → receipt → debt check → allocation (DESIGN_01_RECEIPTS.md 2ג/2ד); the ladder, RemittanceReader, mail search with approval and detail requests are removed. Nina = explains receipts in chat only; Maya = mail. Read only for background.
- memories/files/GAPS_RECEIPTS.md — source text of the build-stage gaps page (/collections/gaps), receipts tab: what to close with Yaniv, what production needs, what is built as a place only. Update it whenever a receipts TODO is added or closed; the page copies it into src/utils/buildDocs/gapsReceipts.ts.
- memories/files/DESIGN_01_RECEIPTS.md — source text of Design 01 · תקבולים on /collections/design (Saar's design file, refined to the real tables). Read before adding the next component's design doc.
- memories/files/DESIGN_02_AGING.md — source text of Design 02 · דוח גיול, rewritten 05.11 (a/notes-engine): open movements per due month, CustomerNotes per customer + month, the work-day schedule 06:00/09:00/10:00, closing at 0 ₪, commitment outcome, grouped tasks, agents, schema. The page copies it into src/utils/buildDocs/designAging.ts. Read before any aging/notes/invoice-layer work.
- memories/files/GAPS_AGING.md — source text of the gaps page, aging tab (src/utils/buildDocs/gapsAging.ts). Update it whenever an aging TODO is added or closed.
- memories/files/DESIGN_03_CREDIT.md — source text of Design 03 · ביטוח אשראי (tab on /collections/design, copied into src/utils/buildDocs/designCredit.ts): obligo static/dynamic, alerts, the 3 credit tables, test customers TEST-011..015. Read before any insurance/obligo work.
- memories/files/DESIGN_FLOWS.md — source of the "דיאגרמה" view on /collections/design: the programmatic steps of each component (01/02/03…) as clickable blocks, copied into src/utils/buildDocs/designFlows.ts. When a component doc changes or a new component (04…) is added, update its blocks here too.
- memories/files/GAPS_CREDIT.md — source text of the gaps page, credit-insurance tab (src/utils/buildDocs/gapsCredit.ts). Update when a credit gap opens or closes.
- memories/files/TEST_PLAN.md — the 11-step test plan given to Saar on 25.10 (step numbers they report against). Read when Saar reports test results.

## Context
Ciment (סימנט): building-materials maker and distributor in Israel, ERP = Priority. First scope: collections (גבייה). An AI collections agent does the routine work for 3 bookkeepers: daily work queue, reminder drafts, logging every contact and payment promise, routing disputes, flagging problems. Humans approve every outbound action. Motif: "agents with an app". Priority tables are a read-only mirror (mock data first, real Priority connection later). UI: Hebrew, RTL. Field names English, enum values Hebrew.

## Rules for every table
- Enum values never contain ASCII ' or ". Use ׳ and ״ (צ׳ק, סמנכ״ל); email = דואל.
- No reference columns yet; links are plain text (customerCode + customerName, invoiceNumber…). Real references later.
- Denormalise display names (customerName, salesAgentName, bookkeeperName) onto every row the agent reads.
- Money ILS, number, 2 decimals. Dates = date, timestamps = datetime.
- Mirror tables have source (priority-mock) and syncedAt. The platform has no column defaults, so writers must set source.
- createdAt is a reserved column name; CreditLimitRequests uses requestCreatedAt.

```
DESIGN RULES
1. 60-30-10 color split: 60% neutral background, 30% cards/panels/nav, 10% accent only for the one primary CTA per screen, active state and critical status.
2. Golden ratio: type ~13–14 / 21–22 / 34–36 px; main/side splits ~62/38; spacing 8, 13, 21, 34.
3. Rule of thirds: the focal element sits on a third line; in RTL the strongest spot is the top-right third.
4. 2/3 proportion: an element above or beside another is ~2/3 its width; containers extend ~1/3 beyond their content.
5. Visual hierarchy: the primary element is 1.5–2x larger than its neighbours; one obvious first place to look per screen.
Motif: "agents with an app". Each screen opens with what the agent did and recommends; data below as evidence. The agent is the subject of every action, with its avatar. Humans approve / adjust / ask; irreversible actions need one human click. Empty states say what the agent is waiting for.
```
Brand: Ciment blue #3743A1 (exact brand blue, sampled from Saar's screenshot 08.11; was #2C44A6) as a restrained accent, iPhone-style liquid glass, calm and clean. Logo: white wordmark as the inline component src/components/CimentLogo.tsx (from ciment.co.il), shown on the blue brand card. Never add image/asset files under src/ — the platform's git import skips non-code files and the build fails; inline SVGs as components. Full rules: memories/files/DESIGN.md.
- memories/files/evals/remittance-reader/README.md: HISTORY — evals for RemittanceReader, removed 08.11. Do not build on it.
- memories/files/DESIGN_SYNC.md — source of the cross-component Design tab "סנכרון עם Priority" (src/utils/buildDocs/designSync.ts, ?doc=sync): one sync strategy for the whole app (5 mechanisms, per-entity table, 3 sync gaps, today's status). Documented 25.10, nothing built. Component docs 01/02/03 point to it; never define sync per component again.
- memories/files/GAPS_SYNC.md — gaps page tab "סנכרון עם Priority" (src/utils/buildDocs/gapsSync.ts). Aging and credit gaps point here instead of their own sync lines.
- memories/files/GAPS_ARCHIVE.md — gaps page tab "ארכיון" (src/utils/buildDocs/gapsArchive.ts): the full old text of every gaps tab, reset 05.11. Never edit; active tabs are rewritten per stage of plan 04.11.
- memories/files/PLAN_0411_r2.md — the full text of plan 04.11 r2 (Saar's file, copied so every branch chat can read it). Plan 04.11 r2 is built on git branches (strategy + status: STORY.md "Plan 04.11" and BUILDER_PLAN-full last section). Read all three before starting any branch.
- memories/files/DESIGN_04_INBOX.md — source of Design 04 · פניות (src/utils/buildDocs/designInbox.ts): the inbox centre (3 tabs, handling states, threading CIM-<id>, Maya = classifier + code routing, Yaniv-style PDF, monthly automation, roles, impacts on 01/02). Read before any mail/inbox work. Build stages and status: BUILDER_PLAN-full, section "רכיב 04 · פניות".
- memories/files/GAPS_INBOX.md — gaps page tab "פניות" (src/utils/buildDocs/gapsInbox.ts).
- memories/files/DESIGN_AGENTS.md — cross Design tab "סוכנים" (?doc=agents): the 4 agents, what each decides vs code.
- memories/files/FINANCE_MODEL.md — BINDING money definitions (6b): open item = ledger line FRECONNUM 0, due date, balance, overdue/asOf, layers, display rules, verified examples. Read before touching any money on screens or in code.
- memories/files/PLAN_SUBFORMS.md — plan (not built) for direct Priority subform reads: contacts, payment lines, invoice lines. Read before building it.
- memories/files/DESIGN_DB.md — cross Design tab "נתונים (DB)" (?doc=db): intro + table→component map + the relations list behind its ER-diagram view (?doc=db&view=diagram, since 29.10). designDb.ts is generated by `node test/tools/gen-db-doc.mjs` and plan.ts by `node test/tools/gen-plan-doc.mjs` (both in test/tools since 01.11 — scripts/ is not kept by the platform); run them via the frontend agent after a table or plan change. Relations stay hand-kept in dbRelations.ts.
- memories/files/DESIGN_05_TASKS.md — source of Design 05 · משימות (tasks page, task sources and keys, severity, promise statuses and rules, invoice sub-status, customer card tabs, schema). Read before any task/promise/customer-card work. Status per stage: BUILDER_PLAN-full "רכיב 05".
- memories/files/GAPS_TASKS.md — gaps page tab "משימות" (src/utils/buildDocs/gapsTasks.ts). At the start of every component-05 stage, first verify the previous stage is live..
- Agents since 01.11: Tamar (CustomerCardAgent; Iris until 03.11 — "איריס" is now only the Ciment employee who loads bank statements) = embedded chat bubble in the customer card (records notes/promises via AddAgingNote after a verbal yes) + daily customer summaries (CustomerSummaryRun at 07:30 → CustomerDailySummaries). No mini-app. See DESIGN_AGENTS.md.
