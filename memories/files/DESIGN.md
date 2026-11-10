# Ciment house style — "Liquid+" (approved 2026-10-18)

Binding for every page, component and future build in this app (and the second agent's screens when they come).
Approved on a design canvas with Saar: https://claude.ai/artifact/FFGjU99sovY7Ar53N7Dm8W (Today's queue = reference screen).
Implemented in `src/index.css` + `src/root.tsx` + shared components. Reuse them; never hand-roll colors or shadows.

## The look
iPhone-style liquid glass, calm and clean. Since 22.10 (see "Packaging background" below) the page is plain white
and the blur is made visible by the diamond band at the top of /collections screens (the old periwinkle wallpaper
with hairlines and circles is gone). Do not make the cards opaque.
Hebrew RTL, Heebo. Ciment blue **#3743A1** (sampled from Ciment's own brand field behind the white wordmark, 08.11; was #2C44A6) is a restrained accent, never a fill for large areas.

## Use these, not raw values
- Surfaces: `glass` (panels, cards, sidebar, table card), `glass-hero` (one hero card per screen),
  `glass-inner` (card inside a card, whiter), `glass-soft` (secondary pills and links), `brand-card` (sidebar logo card only).
- Fills: `bg-glass`, `bg-glass-faint`, `bg-glass-soft`, `bg-glass-inner`, `bg-glass-card`, `bg-glass-strong`.
- Shadows: `shadow-glass`, `shadow-glass-hero`, `shadow-glass-card`, `shadow-glass-pill`, `shadow-primary` (the one accent button).
- Ink: `text-foreground` #161B2E, `--ink-2` #1C2238, `text-muted-foreground` #3A4160, `--link` #1B2F7A.
- Status chips: `--critical-soft/-ink`, `--warning-soft/-ink`, `--success-soft/-ink`, via `StatusBadge`.
- Ordered scales (aging, buckets): `--aging-1..4` monochrome blue ramp. No amber/red ramps for volume data.
- Components: `AgentPanel` (agent-first hero with avatar), `AgentAvatar`, `PageHeader`, `PageStates`
  (loading / error / agent-first empty), `StatusBadge`, `NextPhase` (wraps a disabled control with "יופעל בשלב הבא").

## Layout of every screen
1. Shell: floating glass sidebar on the right (brand card with centered white logo + "שלום, {first name}",
   nav items 44px, active item = white glass pill with blue text), floating glass top bar (date, customer search,
   "שאל את הסוכן"), page content max 1140px.
2. Header: title 36px extra-bold + one muted line; at most one secondary glass link on the left.
3. Agent-first hero (`AgentPanel` / `glass-hero`, ~62% width) with what the agent did and recommends; side column (~38%)
   for the key number (54px, ink, not colored) and supporting cards.
4. Data below as evidence: one full-width `glass` card with a table; status tabs as the glass segmented control.

## Rules (with the DESIGN RULES block in memories/AGENT.md)
- Accent blue only for: brand card, the ONE primary button per screen, active nav, critical status.
- Numbers: big KPI in ink; secondary stats 16px; never three adjacent elements at the same size.
- Spacing 8 / 13 / 21 / 34; radii: cards 26, hero 30, inner 22, pills 22, nav 14.
- Text on glass ≥ 4.5:1. If a background change hurts readability, raise the card fill slightly; never remove the blur.
- Not-yet-built actions: render disabled inside `NextPhase`, never fake them. No mock data, ever.
- Agent identity: name, job title and photo come from the agent artifact via `useAgent` once it exists;
  `AgentAvatar` (dark circle + sparkle) is the placeholder until then.

## Added 2026-10-18 (iteration 3 follow-up)
- Hover: content glass cards only deepen their shadow (glass-lift). NEVER transform/scale/translate/filter/will-change on hover or press: on backdrop-blurred glass the browser rasterises the card and stretches it, so text goes blurry (Saar's complaint, 25.10). No press nudge on buttons. The aging screen and its drawer have no hover effect on cards at all (AgentPanel lift={false}); its sticky column is solid, not blurred. Table zoom uses CSS `zoom`, never transform: scale.
- Cursor: everything clickable shows the pointer (global rule in src/index.css); disabled = not-allowed.
- Dark mode: toggle "מצב כהה/מצב בהיר" in the user menu above התנתקות, using the platform theme setting; dark Liquid+ variant in index.css. User menu dropdown uses the glass style in both modes.
- User names always capitalized (capitalizeName in utils/Format.ts). Top bar date: see 2026-10-22 (Hebrew only; Gregorian moved to the brand card).
- Tables always render their card + header; empty state is agent-first (e.g. Today's queue "כל התור (0)").

## Packaging background (approved direction "B · לבן, לוגו אנכי כמו על המוצר", 2026-10-22)
- Light background (08.11, Saar: "a little bolder in the colors"): a faint Ciment-blue tint `--background` oklch(0.972 0.014 272.8) = #F2F5FF everywhere, so the 55% glass reads visibly blue-white. No wallpaper. Dark mode unchanged (solid dark). The aging screen keeps its own concrete `--ag-page`.
- `DiamondBand` (src/components/DiamondBand.tsx): fixed, aria-hidden band ~288px, full viewport width at the top of /collections screens,
  behind the floating glass sidebar (which blurs it), the top bar and the header (Saar's call, matches the mockup). Whole diamonds, 64px diagonal, staggered rows; even rows alternate
  `--band-deep` #3743A1 (the brand blue) / `--band-mid` #5B7FD6, odd rows `--band-sky` #8CCBEE; `--band-opacity` 0.5 light (was 0.42; 0.28 dark). Bottom edge = points, never a straight cut.
- Glass: `--glass` white 55%, blur(24px) saturate(160%), 1px white-90% edge, soft shadow + inset top highlight + faint navy 1px ring
  (needed so white panels read on white). Declare only the standard backdrop-filter in CSS — a hand-written -webkit- duplicate made the
  minifier drop the standard rule, so blur never worked in Chrome before this round.
- Brand card: solid `--brand` = exactly #3743A1 (oklch(0.43 0.151 272.8), no gradient or glass over it in light mode), one row: vertical real logo (`<CimentLogo orientation="vertical" />`, reads bottom-to-top) at the
  outer edge, thin vertical divider, then the Gregorian date "יום ה׳ · 22.10", "שלום, {first}" large, "מרחב הגבייה של סימנט".
- Top bar: Hebrew date only.
- Contrast on the band (worst case #3743A1@0.5 on #F2F5FF = #949CD0): ink 6.4, muted 4.66, link 4.58. Muted text was darkened to oklch(0.33 0.056 273.5) #2C3352 for this; keep it no lighter and the band no stronger.
- Brand-blue tokens (08.11): `--primary`, `--ring`, `--chart-1`, `--sidebar-primary`, `--sidebar-accent-foreground`, `--ag-cobalt` = oklch(0.43 0.151 272.8) #3743A1; `--link` / `--ag-cobalt-dark` oklch(0.34 0.122 272.8) #252E76; chart-2..4 and aging-1..4 are the same hue 272.8 at L 0.535 / 0.667 / 0.787 / 0.895.

## Receipt status pair (03.11; updated 08.11)
- Every receipt shows two `ReceiptStatusBadges` side by side: receiptStatus (טיוטה / אושרה – לא נשלחה / הונפקה ב-Priority) then the allocation state matchStatus (פיזור מוצע – לאישור / על חשבון – צריך פיזור / מפוזרת / מפוזרת – עודף על חשבון; any older value shows as על חשבון – צריך פיזור), tones via StatusBadge. Labels always come from `receiptStatusOf` / `matchStatusOf` in src/utils/ReceiptRecord.ts (receiptStatus / matchStatus only; the old status column was removed 03.11, step 3).
- No manager badge and no `?manager=1` filter (removed 08.11 with the old matching ladder).
- Receipt tasks open a side sheet (TaskReceiptSheet) that shows the same four-step record panel as the receipts screen (see "Receipt record panel").

## Customer card (01.11, stage 5ב)
- Tabs (glass segmented control): פתוחות (N) · סגורות (N) · אובליגו (shield icon only for insured). `?tab=` none / closed / credit; old `receipts` opens סגורות.
- Promise strip under the KPI row: one `glass` pill row, a status-toned chip per count (tones from StatusBadge via `statusToneClass`), zero counts in faint glass.
- Closed invoices: `glass-inner` rows, invoice facts on one side and its closing receipts as `bg-glass-card` rows on the other (same split as the old receipts tab); "הערכה" is a small warning chip with a tooltip.
- (05.11, a/customer-card-tasks) No "הערה" per invoice any more. A "חודשים פתוחים" glass table (from openMonths) has "הערה" per month as an outline xs pill, opening the ONE floating notes window (`MonthNotesPopover`) — the same window the aging report and grouped-task rows open. Primary button "הוספת הערה" (month picker).
- "התחייבויות" strip replaces the promise strip: status-toned chips קוימו / קוימה חלקית / לא קוימו / פתוחות, each with "נכנס … · נשאר …".
- Tasks page: grouped tasks expand to "N שורות" rows with a one-click "טופל"; the bank-missing task sorts first with a red "דחוף" chip; an "התראות" toggle shows isAlert notices only.

## Receipts screen = Priority mirror (03.11, plan r3 stage 2; superseded in part by the identification list below)
- /collections/receipts opens on today only (no week strip, no stages, no upload, no reader). Order: header → `PriorityPullPanel` (glass: "נמשך מפריוריטי ב-HH:MM" or "עוד לא נמשכו שורות של היום מפריוריטי", the screen's ONE primary button "משוך עכשיו מפריוריטי", the small "מקור בדיקה" segmented control, one result line after a pull; config / errors as Alerts) → the identification list (below; since 08.11 there is no NinaCheckStage / "נכנסות לבדיקה") → "לא מטופלות" glass table (פירעון צ׳ק / אחר, note "מוצג בלבד – לא נכנס לבדיקת התקבולים", no actions) → collapsed glass Accordion "שורות ישנות מקובץ (לצפייה)" (`LegacyFileLines`, read only, paged 50).
- Links into a line are `?line=<bankLineId>` only; a line from another day shows beside today's with an Alert, an old file line opens the accordion with the row marked.
- The pull's result is said once (on screen); the toast only says it finished.

## Identification list and approve-all (05.11, plan 04.11 r2 part B stage 4)
- Header line on the right of the title: a `glass-soft` pill "מקור השורות: <קובץ דף בנק | שורות פריוריטי> · שינוי בהגדרות" → /collections/settings (AgentSettings bankLinesSource, קובץ when missing). Settings → כללים has the card "מקור שורות דף הבנק": segmented קובץ / שורות פריוריטי + identifyCertainAt and customerAutoApproveAt (empty = כבוי).
- Source panel under the header: Priority mode = `PriorityPullPanel`; file mode = `FileModePanel` (one glass row: upload by click/drag, reading, then `ExtractedLinesCheck` — totals line, mismatch Alert, lines table with a quiet "תיקון" per line, "בדקתי מול הבנק", "אישור השורות וזיהוי לקוחות").
- One primary button per screen, by state: before identified lines exist it is the pull / upload / confirm; once they exist it is "אשר את כל הוודאיים (M)" and the pull / upload turn outline.
- `IdentifySection` (one glass card): heading "השורות הגיעו ב-HH:MM · N שורות · M ודאיות", one muted line (open count + "ודאי = ביטחון X ומעלה"), "זהה מחדש" (ghost glass) + the primary. Approve-all always goes through an AlertDialog with the count and total ("אי אפשר לבטל").
- Table order: לא זוהה, לא ודאי, ודאי, approved. Columns: מעביר (+reference), סכום, ערך, לקוח מוצע (CustomerLink; a Combobox with candidates first for open lines), ביטחון (number + thin ink bar with a blue tick at the threshold — never a coloured fill), שיטה וראיה (method bold + one clamped evidence line), מצב.
- Open rows: outline "אשר לקוח והוצא קבלה"; certain rows: a ghost xs "אשר". Approved rows: `ReceiptStatusBadges` (על חשבון – צריך פיזור) + "PDF" (GenerateReceiptPdf → Dialog with PdfViewer + download link), then the mail line ("טיוטה ל-<email> – ממתינה לאישור בדואר יוצא" link to the outbox draft, or a warning chip "חסר איש קשר הנהלת חשבונות" → customer card), then `AllocationSummary` (05.11 stages 5–7): debt-check chip with the closed months, "מפוזר" / "על חשבון" amounts and an outline "פיזור לחשבוניות" that opens the allocation editor (`SplitEditor` → `AllocationEditor` side sheet: invoices grouped by due month, closed months highlighted, checkbox + amount per invoice, running total, surplus line, one primary "אשר פיזור"). Agent cheques: `AgentChequesSection` under the list with one outline "משוך צ׳קים של סוכנים".
- IssueReceipt's skipped reasons and errors show as one Alert inside the card, dismissible; the toast only says how many receipts went out.
- (08.11) Every today העברה / זיכוי בנק line is in this list; a line not identified yet shows "ממתינה לזיהוי" with a "זהה" button (IdentifyCustomers). Order: ממתינה לזיהוי, לא זוהה, לא ודאי, ודאי, approved.

## Receipt record panel (08.11)
- Clicking an identification-list row (`?line=`) or an agent-cheque row (`?receipt=`) opens `ReceiptFlowPanel`: a side sheet (max 920px) with a vertical 4-step stepper — זיהוי → קבלה → בדיקת חוב → פיזור — each step with its status and evidence, or one waiting line when not reached ("מחכה לאישור הלקוח"…). Customer facts and open notes per month sit in a block beside the steps.
- Step 2 holds the PDF, the mail status, the copy-to-Priority text and "הונפקה ב-Priority" (number + button); step 3 a month / balance / cumulative table with closed months highlighted; step 4 the allocation rows and the existing AllocationEditor.

## Aging report on movements (05.11, plan 04.11 stage 3)
- Notes = a small chip per period (active count + a dot when one is due; "+" on hover when empty) opening ONE floating notes window (white card) per customer + month; the "what task will open" line under an active type has a faint cobalt tint.
- The pull status ("נמשך מפריוריטי ב-HH:MM") and the screen's one primary button "משוך עכשיו מפריוריטי" sit inside the hero.
