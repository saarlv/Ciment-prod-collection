import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { DownloadIcon, FileTextIcon, XCircleIcon } from 'lucide-react';
import { GenerateReceiptPdfAction } from '@/product-types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PdfViewer } from '@/components/ui/pdf-viewer';
import { Spinner } from '@/components/ui/spinner';
import { openableFileUrl } from '@/utils/BankFile';

/** Generated receipt PDFs of this tab, by receiptKey: a second open shows the same file without another call. */
const generated = new Map<string, string>();

interface PdfOutput {
  url?: string;
  fileName?: string;
  errors?: string[];
}

/**
 * "PDF" on an approved receipt: GenerateReceiptPdf {receiptKey} once, then the file in a dialog (PdfViewer) with a
 * download link to the same url — the file the customer's mail draft carries.
 */
export function ReceiptPdfButton({ receiptKey, label }: { receiptKey: string; label: string }) {
  const { executeFunction } = useExecuteAction(GenerateReceiptPdfAction);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(() => generated.get(receiptKey) ?? null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    if (url || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = (await executeFunction({ receiptKey })) as PdfOutput | null;
      if (out?.url) {
        generated.set(receiptKey, out.url);
        setUrl(out.url);
      } else setError(out?.errors?.join(' · ') || 'הקובץ לא הופק.');
    } catch {
      setError('הקובץ לא הופק. נסו שוב בעוד רגע.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="xs" className="rounded-full bg-glass-soft" onClick={() => void show()} aria-label={`PDF של הקבלה ${receiptKey}`}>
        {busy ? <Spinner data-icon="inline-start" /> : <FileTextIcon data-icon="inline-start" />}
        PDF
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>קבלה {receiptKey}</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <XCircleIcon />
              <AlertTitle>ה-PDF לא הופק</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                {error}
                <Button variant="outline" size="sm" onClick={() => void show()}>
                  ניסיון נוסף
                </Button>
              </AlertDescription>
            </Alert>
          ) : url ? (
            <>
              <div className="h-[62vh] overflow-hidden rounded-[22px] border border-glass-edge bg-glass-card">
                <PdfViewer file={url} defaultWidth={620} minWidth={320} />
              </div>
              <a
                href={openableFileUrl(url)}
                target="_blank"
                rel="noreferrer"
                download={`receipt-${receiptKey}.pdf`}
                className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-link hover:underline"
              >
                <DownloadIcon className="size-4" />
                הורדת הקובץ
              </a>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              מפיק את הקבלה…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}