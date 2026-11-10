---
name: file-parsing
description: Parsing and previewing files in this project — CSV parsing with PapaParse, Excel/XLSX reading with SheetJS, and PDF viewing with the PdfViewer component. Load this skill whenever the task involves reading uploaded files, parsing structured data from CSV or Excel, or previewing a PDF.
user-invocable: false
---

# File Parsing Skill

## CSV and Excel

`papaparse` and `xlsx` (SheetJS) are installed — parse with them rather than by hand. Real uploads carry quoted fields, embedded delimiters, and CRLF, and an XLSX file is a zipped XML container with no manual path in.

- **CSV** — `import Papa from 'papaparse'`. `Papa.parse(fileOrString, { header: true, skipEmptyLines: true, dynamicTyping: true, complete })` to read a `File` or a string; `Papa.unparse(rows)` to export.
- **Excel** — `import * as XLSX from 'xlsx'`. Read the file's `ArrayBuffer` with `XLSX.read(buf, { type: 'array' })`, then `XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])` for the first sheet's rows.

## PDF preview with PdfViewer

Use `PdfViewer` for any PDF viewing — not `<iframe>`, `<object>`, `react-pdf`, or `pdfjs` directly. It provides page navigation, zoom, and optional field overlays, and ships in the local Blocks registry; install it if `src/components/ui/pdf-viewer.tsx` does not exist yet:

```bash
yes n | CI=1 pnpm dlx shadcn@4.23.0 add ./.blocks-registry/pdf-viewer.json -y
```

```tsx
import { PdfViewer } from '@/components/ui/pdf-viewer';

<div className="h-[600px]">
  <PdfViewer file={pdfUrl} />
</div>;

// Field overlays. Required per field: name, x, y, page (0-indexed).
// Optional: width, height, label, type.
const fields = [
  {
    name: 'member_email',
    x: 27.6,
    y: 626.4,
    width: 213.48,
    height: 15.84,
    page: 0,
    type: 'text',
  },
];

<PdfViewer file={pdfUrl} fields={fields} showAll showLabels />;
<PdfViewer file={pdfUrl} fields={fields} showFields={['member_email']} />;
// onPageChange receives the 1-based page number
<PdfViewer file={pdfUrl} onPageChange={(page) => setPage(page)} />;
```

- No overlays render by default: pass `showAll` or `showFields={[…]}`. `showLabels` adds the field-name label above each overlay and `showAnnotations` renders native PDF annotations (links, comments) — both off by default.
- Give the container a defined height. `PdfViewer`'s root is `h-full`, so it inherits its parent's height; in a parent with no height that resolves to zero and nothing renders.
