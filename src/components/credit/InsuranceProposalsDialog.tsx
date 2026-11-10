import { useState } from 'react';
import { useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AlertCircleIcon, ListChecksIcon } from 'lucide-react';
import { ProposeInsuranceRequestsAction } from '@/product-types';
import { CustomerLink } from '@/components/CustomerLink';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { formatPct1 } from '@/utils/CreditExposure';
import { formatILS, todayISO } from '@/utils/Format';

/** One CreditLimitRequests row the action would write (or wrote). */
interface Proposal {
  customerCode?: string | null;
  customerName?: string | null;
  currentLimit?: number | null;
  obligoPct?: number | null;
  requestedLimit?: number | null;
}

interface ProposeResult {
  thresholdPct?: number;
  increasePct?: number;
  checked?: number;
  proposals?: Proposal[];
  created?: number;
  errors?: string[];
}

function asResult(value: unknown): ProposeResult {
  return value && typeof value === 'object' ? (value as ProposeResult) : {};
}

/**
 * "בדיקת לקוחות מעל הסף" on היום's credit-insurance card: a dry run of ProposeInsuranceRequests lists the
 * increase proposals it would open (customer, insured limit, use %, requested amount); "יצירת הצעות" writes
 * them. Nothing goes to the insurer; each proposal is approved later on the customer's אובליגו וביטוח tab.
 */
export function InsuranceProposalsDialog({ onCreated }: { onCreated: () => void }) {
  const scope = useOwnerScope();
  const { executeFunction } = useExecuteAction(ProposeInsuranceRequestsAction);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<ProposeResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function check() {
    setOpen(true);
    setChecking(true);
    setPreview(null);
    setFailed(null);
    try {
      const res = asResult(await executeFunction({ asOfDate: todayISO(), proposedBy: scope.actorName, dryRun: true }));
      if (res.errors?.length) setFailed(res.errors.join(' · '));
      setPreview(res);
    } catch {
      setFailed('הבדיקה לא הצליחה. נסו שוב בעוד רגע.');
    } finally {
      setChecking(false);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const res = asResult(await executeFunction({ asOfDate: todayISO(), proposedBy: scope.actorName, dryRun: false }));
      if (res.errors?.length) {
        toast.add({ title: 'ההצעות לא נוצרו במלואן', description: res.errors.join(' · '), type: 'error' });
        return;
      }
      const n = res.created ?? res.proposals?.length ?? 0;
      toast.add({
        title: n === 0 ? 'לא נוצרו הצעות' : n === 1 ? 'נוצרה הצעת הגדלה אחת' : `נוצרו ${n} הצעות הגדלה`,
        description: 'ההצעות מחכות לאישור בלשונית "אובליגו וביטוח" של כל לקוח. שום דבר לא נשלח לבסס״ח.',
        type: 'success',
      });
      setOpen(false);
      onCreated();
    } catch {
      toast.add({ title: 'ההצעות לא נוצרו', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setCreating(false);
    }
  }

  const proposals = preview?.proposals ?? [];

  return (
    <>
      <Button variant="outline" size="sm" className="self-start rounded-full" onClick={check} disabled={checking}>
        {checking ? <Spinner data-icon="inline-start" /> : <ListChecksIcon data-icon="inline-start" />}
        בדיקת לקוחות מעל הסף
      </Button>
      <Dialog open={open} onOpenChange={(next) => !creating && setOpen(next)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>הצעות להגדלת מסגרת הביטוח</DialogTitle>
            <DialogDescription>
              לקוחות מבוטחים שהאובליגו הדינמי שלהם הגיע ל{preview?.thresholdPct ? `־${formatPct1(preview.thresholdPct)}` : 'סף'} מהמסגרת
              ואין להם בקשה פתוחה. שום דבר לא נשלח לבסס״ח.
            </DialogDescription>
          </DialogHeader>

          {checking ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : failed ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>הבדיקה לא הושלמה</AlertTitle>
              <AlertDescription>{failed}</AlertDescription>
            </Alert>
          ) : proposals.length === 0 ? (
            <p className="rounded-[18px] bg-glass-faint px-[13px] py-3 text-sm text-ink-2">אין לקוחות מעל הסף ללא בקשה פתוחה.</p>
          ) : (
            <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
              {proposals.map((p, i) => (
                <li key={`${p.customerCode}-${i}`} className="flex flex-col gap-0.5 rounded-[18px] bg-glass-card px-[13px] py-2.5">
                  <span className="text-[13px] font-semibold">
                    <CustomerLink code={p.customerCode} name={p.customerName} />
                  </span>
                  <span className="flex flex-wrap gap-x-[13px] gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                    <span>מבוטח {formatILS(p.currentLimit)}</span>
                    <span>ניצול {formatPct1(p.obligoPct)}</span>
                    <span className="font-semibold text-foreground">מבוקש {formatILS(p.requestedLimit)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
              סגירה
            </Button>
            {proposals.length > 0 && !failed && (
              <Button onClick={create} disabled={creating || checking}>
                {creating && <Spinner data-icon="inline-start" />}
                {proposals.length === 1 ? 'יצירת הצעה' : `יצירת ${proposals.length} הצעות`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}