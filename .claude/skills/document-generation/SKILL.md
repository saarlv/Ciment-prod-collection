---
name: document-generation
description: Generating quote, invoice, receipt, statement, or other document PDFs that are previewed, downloaded, or emailed as attachments. Load this skill whenever the task involves creating a PDF document (quote, invoice, receipt, statement, purchase order, work order), sending a document as an email attachment, or previewing/downloading a generated PDF. Covers the single-source-of-truth pattern so preview and email PDFs always match.
user-invocable: false
---

# Document Generation Skill

Use this skill when the app needs to **generate** a document PDF (quote, invoice, receipt, statement, etc.) that users can **preview**, **download**, or **email as an attachment**.

## The golden rule (single source of truth)

**Generate the document once, server-side, and every surface (preview, download, email) uses that exact PDF.** The preview PDF and the emailed PDF must be identical because they come from the **same action** and the **same HTML template**.

Never maintain two implementations — a React/Tailwind page for preview plus a Handlebars template for email, `window.print()` for preview plus a server PDF for email, or two templates for one document type. Two renderers drift (BLK-492).

## Architecture (mandatory pattern)

### Step 1 — One shared HTML template per document type

Store the template in **one place** — either a Handlebars template string in the DAG action's `CompileTemplate` node, or a shared TypeScript export in `src/utils/<doc>-template.ts` that returns a self-contained HTML string. It must be WeasyPrint-safe (below), and it is the **only** HTML source for that document type.

### Step 2 — One app action: `Generate<Doc>Document`

Create a DAG action (e.g. `GenerateQuoteDocument`, `GenerateInvoiceDocument`) with:

1. **CompileTemplate** — render the shared Handlebars template
   - `escapeHtml: false` (required — otherwise the HTML is escaped and the PDF breaks)
   - `input`: document data (customer, lineItems, totals, dates, logoUrl, etc.)
2. **HtmlToPdf** — convert rendered HTML to PDF
   - `html: "{{CompileTemplate.output}}"`
   - `pdfFilename`: e.g. `"quote-{{input.quoteNumber}}.pdf"`
3. **Edge** `CompileTemplate` → `HtmlToPdf`: `edges: [{ "name": "compile-to-pdf", "source": "CompileTemplate", "target": "HtmlToPdf" }]`. Run order comes only from edges (see `app-artifacts/actions/actions.md`, Graph entry points); add one edge per extra step (e.g. a node that saves the `url` on the record).
4. **Output**: the `HtmlToPdf` node's `url` field (protected PDF URL)

Set `exposedToUI: true` so the frontend can call this action for preview and download.

### Step 3 — Email reuses the same PDF

Create a separate action (e.g. `SendQuoteEmail`) that calls `Generate<Doc>Document` (or inlines the same CompileTemplate → HtmlToPdf nodes), then **SendEmail** with `attachments: [{ url: "{{GenerateQuoteDocument.url}}" }]`. Never generate a different PDF for email than for preview.

### Step 4 — Frontend preview uses the generated PDF URL

```tsx
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { PdfViewer } from '@/components/ui/pdf-viewer';
import { GenerateQuoteDocumentAction } from '@/product-types';

function QuotePreview({ quoteId }: { quoteId: string }) {
  const { executeFunction } = useExecuteAction(GenerateQuoteDocumentAction);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    executeFunction({ quoteId }).then((result) => {
      setPdfUrl(result.url);
    });
  }, [quoteId]);

  if (!pdfUrl) return <div>Generating preview…</div>;

  // Reuse the SAME url for the download link.
  return (
    <div className="h-[700px]">
      <PdfViewer file={pdfUrl} />
    </div>
  );
}
```

Preview = `PdfViewer` on the URL from `Generate<Doc>Document`; download = the same URL; email = the same URL in `SendEmail` attachments. Load the **`file-parsing`** skill for full `PdfViewer` API details.

## WeasyPrint HTML constraints (critical)

`HtmlToPdf` uses **WeasyPrint** on the server. It is **not** a browser.

**DO:** table-based layout, inline CSS only (`style="..."` on every element), explicit column widths, self-contained HTML (`<!DOCTYPE html>` … `</html>`), absolute image URLs.

**DO NOT:** Tailwind classes, flexbox or CSS grid (layout collapses), CSS variables (`var(--primary)` is not resolved), external stylesheets (no `base_url` is set), or base64 images (`data:image/png;base64,…` is broken in WeasyPrint).

## Logo and image handling

Images must use absolute URLs WeasyPrint can fetch from the server. If the logo is an **internal** protected URL, call **GenerateFileSignedUrl** first and pass the signed URL into the template as `logoUrl`. Passing a raw internal URL to email or PDF fails — external systems cannot reach protected URLs.

## Platform action names (use these exact names)

| Purpose                      | Action name               | Notes                                    |
| ---------------------------- | ------------------------- | ---------------------------------------- |
| Render Handlebars template   | **CompileTemplate**       | `escapeHtml: false` for HTML/PDF         |
| HTML → PDF                   | **HtmlToPdf**             | WeasyPrint; input is self-contained HTML |
| Send email with attachment   | **SendEmail**             | `attachments: [{ url: "..." }]`          |
| Public URL for internal file | **GenerateFileSignedUrl** | Required before external access          |

There is no `RenderTemplate` or `TemplateRender` — the built-in action is **CompileTemplate**. Always call **DescribeActions** to get the correct `actionTypeId`.
