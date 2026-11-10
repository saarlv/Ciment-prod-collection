import { ReceiptFlowPanel } from '@/components/receipts/ReceiptFlowPanel';
import { TaskSourceLink } from '@/components/tasks/TaskSourceLink';
import { formatILS } from '@/utils/Format';
import { receiptKeyOf, receiptLineIdOf, receiptTaskKind } from '@/utils/Tasks';
import type { ReceiptTaskKind, Task } from '@/utils/Tasks';

const KIND_LEAD: Record<ReceiptTaskKind, string> = {
  identify: 'הלקוח זוהה בביטחון נמוך. מאשרים או בוחרים לקוח בצעד הזיהוי, והקבלה יוצאת.',
  customer: 'לא זיהינו מי המעביר, ולכן עוד אין קבלה. בוחרים לקוח בצעד הזיהוי.',
  allocate: 'הקבלה יצאה ומחכה לפיזור לחשבוניות. המשימה נסגרת לבד כשהקבלה מפוזרת עד הסוף.',
  'debt-check': 'הסכום לא סוגר אף חודש פירעון. בודקים את היתרות בצעד בדיקת החוב ומבררים מול הלקוח על מה התשלום.',
  'debt-zero': 'הקבלה סגרה לאפס את החודשים שבצעד בדיקת החוב. התראה בלבד, בלי פעולה.',
};

/**
 * The task panel for the receipts tasks: the one record panel (ReceiptFlowPanel — זיהוי → קבלה → בדיקת חוב → פיזור)
 * over the task's receipt or bank line, with the task's title and one lead line above the steps. The list updates live.
 */
export function TaskReceiptSheet({ task, receiptHref, onClose }: { task: Task | null; receiptHref: (id: string) => string | null; onClose: () => void }) {
  const kind = task ? receiptTaskKind(task) : null;
  const receiptKey = task ? receiptKeyOf(task) : null;
  const bankLineId = task && !receiptKey ? receiptLineIdOf(task) : null;
  return (
    <ReceiptFlowPanel
      open={!!task}
      onOpenChange={(o) => !o && onClose()}
      receiptKey={receiptKey}
      bankLineId={bankLineId}
      context={
        task && (
          <div className="flex flex-col gap-1 rounded-[18px] bg-glass-inner p-[13px]">
            <span className="text-[13px] font-bold">{task.title || task.taskType || 'משימת תקבול'}</span>
            <span className="text-xs text-muted-foreground">{[task.taskType, task.customerName, task.amount ? formatILS(task.amount) : null].filter(Boolean).join(' · ')}</span>
            {kind && <p className="text-[13px] text-ink-2">{KIND_LEAD[kind]}</p>}
            <TaskSourceLink task={task} receiptHref={receiptHref} className="self-start" />
          </div>
        )
      }
    />
  );
}