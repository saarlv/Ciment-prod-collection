import { Link } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon } from 'lucide-react';
import { InboundEmailsEntity } from '@/product-types';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getRouteUrl } from '@/lib/platform';
import { formatDateTime } from '@/utils/Format';
import { emailStatusTone, isIrrelevant, verificationTone } from '@/utils/Inbox';

const HEAD = 'text-xs font-semibold text-muted-foreground';

/** /maya/inbox — the emails Maya handled, newest first; each opens its drawer in the collections inbox. */
export default function MayaInbox() {
  const { name } = useInboxAgent();
  const q = useEntityGetAll(InboundEmailsEntity, { orderBy: [{ column: 'receivedAt', direction: 'desc' }], page: { size: 50 } });
  const rows = q.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-[13px]">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[28px] leading-tight font-extrabold">פניות</h1>
          <p className="text-sm text-muted-foreground">המיילים ש{name} קראה בתיבות: סיווג, אימות השולח והסטטוס. לחיצה פותחת את הפנייה בתור הפניות.</p>
        </div>
        <Button variant="outline" render={<Link to="/collections/inbox" />}>
          לתור הפניות
          <ArrowUpLeftIcon data-icon="inline-end" />
        </Button>
      </div>

      {q.isError ? (
        <LoadError what="הפניות" />
      ) : q.isLoading ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <AgentEmpty agent="maya" title="עוד לא נכנסו מיילים">
          {name} קוראת כל מייל שנכנס לתיבות העבודה, מסווגת אותו, מאמתת את השולח ומכינה טיוטה.
        </AgentEmpty>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${HEAD} ps-[21px]`}>התקבל</TableHead>
                <TableHead className={HEAD}>שולח ונושא</TableHead>
                <TableHead className={HEAD}>סוג</TableHead>
                <TableHead className={HEAD}>אימות</TableHead>
                <TableHead className={`${HEAD} pe-[21px]`}>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} className="hover:bg-glass-faint">
                  <TableCell className="ps-[21px] align-top whitespace-nowrap tabular-nums">{formatDateTime(e.receivedAt)}</TableCell>
                  <TableCell className="max-w-80 align-top whitespace-normal">
                    <Link
                      to={getRouteUrl('/collections/inbox', {}, { email: e.id })}
                      className="flex flex-col gap-0.5 hover:text-link hover:underline"
                    >
                      <span className="font-semibold">{e.subject || 'ללא נושא'}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.fromName ? `${e.fromName} · ` : ''}
                        <span dir="ltr">{e.fromAddress}</span>
                        {e.customerName ? ` · ${e.customerName}` : ''}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge value={e.category ?? 'לא סווגה'} tone={isIrrelevant(e) ? 'neutral' : 'active'} />
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge value={e.senderVerification ?? 'לא נבדק'} tone={verificationTone(e.senderVerification)} />
                  </TableCell>
                  <TableCell className="pe-[21px] align-top">
                    <StatusBadge value={e.status} tone={emailStatusTone(e.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {q.hasNextPage && (
        <Button variant="outline" className="self-center" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? 'טוען…' : 'פניות קודמות'}
        </Button>
      )}
    </div>
  );
}