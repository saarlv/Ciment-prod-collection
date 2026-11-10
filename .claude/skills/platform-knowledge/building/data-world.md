# Data world: tables, import/export, files

## The Data panel

Groups:

- **Tables** — hover a table's row for the arrow at its end; it lists the table's columns under it, without opening the table
- **Views** — read-only derived tables: totals, joins, filtered lists, computed columns
- **Company data** — the Brain tables this app reads, synced from the account's sources: one row per table, with its source's logo where Blocks has one, else a table icon. **+** beside **Company data** (**Add company data**) adds tables; with none yet it says **No company data yet**. Each table opens a preview of its first rows with **Built from** / **Used by** links and **Lineage** (the data map, this table's path highlighted). Its page's **Settings** gear (or the row's **⋯ → Settings**, or a double-click on the row) opens its schedule and **Sync now** in the side panel. A company table's header **⋯** has **dbt project** (every file behind the saved queries, with **Deploy**) and **Fetch data…** (the full request form: file sources, columns, filters, schedule). Removing a table or deleting a query is done by asking Ella; Blocks system admins also have **Delete** in a row's **⋯**, which withdraws a table's request [flag: brain-enabled]. See `app-capabilities/brain-company-data.md`.
- **Saved queries** — the app's saved queries (tables built from its company data), shown only when it has one. Each opens the same preview (every link to a saved query does); its page's **Edit query** opens the dbt project editor on that query. A new saved query is a **New file** under models/ in the dbt project [flag: brain-enabled].
- **Search indexes** — what the app's agent can search by meaning, one row per searchable table or folder, shown only when the app has one. Each opens a read-only page with its source, the columns it searches, and whether it's searchable yet [flag: brain-enabled]. See `app-capabilities/brain-company-data.md`.
- **Folders** — files: **User Uploads** (each file's indexing status [flag: rag]), plus a **Knowledge Base** [flag: kb-view]

## Table page

- Toolbar:
  - **Search…**, **Filter**, **Columns** (show or hide)
  - **Actions** menu: **Export data** (CSV), **Import CSV**, **Get template**
  - **Add row**
- Hover a cell to **Edit cell** or **Copy value**. Last-updated columns are set by Blocks and can't be edited. Select rows to delete several at once.
- Tables show 200 rows per page. Data changes appear live in open app screens; Views don't update live.
- **Columns can't be added, renamed or deleted here.** Ask Ella to change the table's structure.
- **Table settings** has two tabs:
  - **General**: name, display column, **Copy data on app duplicate**, unique key, **Handle duplicates automatically**.
  - **Access**: who can view or submit, and the tenant scope. See `sharing-and-access/data-permissions.md`.
- **Column settings**: in the Data panel, hover the table's row, click the arrow at its end to list its columns, then click a column (a column of a table that isn't open opens that table first). **Type** and **Links to** are shown but can't be changed; **Description**, **Required**, **Default value** (picked from the allowed values when the column has some), **Allowed values** (text columns: type a value, press Enter) and **Relationship** are editable. Older tables' columns also have **Header**, the title the grid shows. A computed column shows its **Expression** in place of **Required**, **Default value** and **Allowed values**.
- Every row automatically records who created and updated it, and when.

## Table editor [flag: data-editor-v2]

With this on, a table opens in a spreadsheet-style editor instead of the grid above. Views open in it read-only.

- Toolbar, left: **Search** (Ctrl/⌘+F), **Filter**, **Sort** (several fields, in order), **Group**, **Fields** (show or hide, **Show all** / **Hide all**), **Row height** (**Compact**, **Default**, **Tall (wrap text)**). Right: **Keyboard shortcuts**, **Undo**, **Redo**, the **⋯** menu (**Import CSV**, **Export CSV**, **Download CSV template**) and **New record**.
- Edit in place: click a cell and type, or press Enter / double-click. Enter saves and moves down, Tab moves right, Esc cancels, clicking away saves. Long text opens a larger box over the cell that grows as you type (Shift+Enter or Alt+Enter for a new line). JSON opens a code editor with highlighting, **Format** and **Save** (Ctrl/⌘+Enter); invalid JSON shows why and is never saved. Options and users open a searchable list; a link to another table lists that table's records by name (its display column, else its first text column), so you pick rather than type an ID. Dates and date-times open a calendar with **Today** / **Now** and **Clear**, and also accept typed dates like `2026-01-31`, `31/01/2026` or `2026-01-31 14:30`; times accept `9:30`, `2:30 pm` or `1430`. Checkboxes toggle with a click, Space or Enter. A value a column can't take (a letter in a number, a 25:00 time) stays in the editor with the reason instead of saving.
- Select a range by dragging or Shift+click / Shift+arrows. Copy, cut and paste work with Excel and Google Sheets; pasting past the last row adds records. Ctrl/⌘+D fills down, Delete clears, Ctrl/⌘+Z undoes (cell edits and added records — not deletes).
- A column header's menu: **Sort ascending** / **Sort descending**, **Group by this field**, **Freeze up to here**, **Hide field**, **Copy field key**, **Field settings** (the column settings below). Drag a header to reorder it, drag its edge to resize it (double-click the edge to reset). Click a header to select the column.
- Right-click a cell: **Copy**, **Clear**, **Fill down**, **Expand record**, **Duplicate record**, **Delete record** (asks first; deleted records can't be restored).
- Each row has a checkbox and an expand icon. Checked rows get **Duplicate** and **Delete** in the toolbar.
- **Export CSV** downloads what the view shows: its visible fields, filtered and sorted.
- **Expand record** (Shift+Enter, Space, or the row's expand icon) opens the record beside the table: every field editable, hidden fields under their own heading, who created and updated it, and up/down arrows to step through the records. A table with required columns opens **New record** there, with **Create record** once they're filled.
- The bar under the grid shows the record count; each column's cell there can **Summarize** it (sum, average, filled, unique, earliest, latest…).
- Links to records in other tables open that table on the linked record.
- Column order, widths, frozen columns, sort, grouping, row height and summaries are saved for this browser only. Search, filters and hidden fields are in the page's link, so sharing the link shares them.
- Tables over 10,000 rows load as you scroll; search, filters, grouping and **Export CSV** are off for them, sorting still works.
- Columns still can't be added, renamed or deleted here; ask Ella.

## Import and export

- **CSV only.** **Import CSV** has a matching step: match each CSV column to a table column or choose **Don't import**. **First row is headers** is on by default.
- **Excel can't be imported straight into a table.** Save it as CSV first, or ask Ella to build an "upload Excel" feature into the app.
- **Export data** downloads the table as CSV.
- To move data to another app, export it and import it there, or share it between apps with **Settings → Dependencies**.
- Large imports use usage credits, because every 10 rows written counts.

## Files and uploads

- Files uploaded through the app are stored by Blocks, up to **1 GB per file**. They appear under **Data → Folders → User Uploads**.
- There's no "file" column type. A file is stored as a link in a text column.
- Attachments in Ella's chat and in in-app agent chats are limited to **5 MB per file**.

## Data while a draft exists

- In a draft you see live data plus rows you created in the draft.
- Edits in the draft don't change live rows.
- Rows created in the draft aren't carried to live.

## Limits

- There's no row-count quota per table. Very large tables load slowly in the builder grid, and in the app if a page loads every row. Ask Ella to add paging or summaries.
- Rapid bursts of writes (more than about 1,000 table operations a minute in one app) are briefly throttled.
- Dates must be between the years 1000 and 9999.
