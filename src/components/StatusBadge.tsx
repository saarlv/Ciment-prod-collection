import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'critical' | 'warning' | 'active' | 'done' | 'neutral' | 'info' | 'follow';

const TONE_BY_VALUE: Record<string, Tone> = {
  // queue / approvals
  ממתין: 'warning',
  בטיפול: 'active',
  טופל: 'done',
  נדחה: 'neutral',
  אושר: 'done',
  'אושר – לא נשלח': 'done',
  'אושר – לביצוע ב-Priority': 'info',
  בוצע: 'done',
  נשלח: 'done',
  // receipts (08.11 flow): bank line statuses, the receipt's status beside its allocation state
  'קבלה הונפקה': 'done',
  לבדיקה: 'active',
  'לא מזוהה': 'warning',
  'הונפקה ב-Priority': 'done',
  'טיוטה – ממתינה לאישור': 'active',
  'אושרה – לא נשלחה': 'info',
  // identification: identifyStatus, a line not identified yet; the allocation states; the receipt mail
  'ממתינה לזיהוי': 'neutral',
  ודאי: 'info',
  'לא ודאי': 'active',
  'לא זוהה': 'warning',
  'אושר אוטומטית': 'done',
  'על חשבון – צריך פיזור': 'warning',
  'פיזור מוצע – לאישור': 'info',
  מפוזרת: 'done',
  'מפוזרת – עודף על חשבון': 'done',
  'טיוטה – בדיקה': 'active',
  'חסר איש קשר': 'warning',
  מלאה: 'done',
  חלקית: 'warning',
  התקבלה: 'done',
  // commitment outcome (CustomerNotes, plan 04.11); פתוחה is the invoice tone below
  קוימה: 'done',
  'קוימה חלקית': 'warning',
  'לא קוימה': 'critical',
  // stages
  תקין: 'done',
  תזכורת: 'neutral',
  'פנייה שנייה': 'warning',
  שיחה: 'warning',
  'הוסלם למנהל': 'critical',
  // invoices
  פתוחה: 'active',
  'שולמה חלקית': 'warning',
  שולמה: 'done',
  בזיכוי: 'neutral',
  // invoice sub-status (Design 05): by precedence בבירור > שולמה חלקית > פתוחה
  בבירור: 'follow',
  // promises (Liquid+): open = white glass, seen = soft blue, fulfilled = green, partial = amber, broken = red,
  // deferred with approval = quiet grey. Legacy נקיימה / נקיימה חלקית read as מומשה / מומשה חלקית (DISPLAY_LABEL).
  'נראה תשלום': 'info',
  מומשה: 'done',
  'מומשה חלקית': 'warning',
  נקיימה: 'done',
  'נקיימה חלקית': 'warning',
  הופרה: 'critical',
  'נדחתה באישור': 'neutral',
  // severity (Design 05): score levels
  קריטית: 'critical',
  גבוהה: 'warning',
  בינונית: 'active',
  נמוכה: 'neutral',
  // disputes (documents and price cases)
  'ממתינה לסריקה': 'active',
  'תזכורת בטיוטה': 'warning',
  הוסלמה: 'critical',
  'מוכנה לשליחה ללקוח': 'info',
  'ממתינה לאישור סוכן': 'active',
  'ממתינה לאישור מנהל': 'active',
  'ממתינה לזיכוי': 'warning',
  נסגרה: 'done',
  // credit requests
  טיוטה: 'neutral',
  'הוצעה ע״י הסוכנת': 'warning',
  'אושר – לא הוגש': 'done',
  'ממתינה להגשה': 'active',
  'אושרה חלקית': 'warning',
  'עודכן ב-Priority': 'done',
  'הוגשה למבטח': 'active',
  אושרה: 'done',
  נדחתה: 'critical',
  // credit covers and insured use (27.10)
  תקף: 'done',
  מבוטל: 'neutral',
  גבוה: 'warning',
  'ניצול גבוה': 'warning',
  פקיעה: 'warning',
  // customers
  פעיל: 'done',
  זמני: 'warning',
  חסום: 'critical',
  // imports
  נכתב: 'done',
  נקרא: 'active',
  נכשל: 'critical',
};

/**
 * Soft glass chips — calm tints with dark ink so every chip stays ≥4.5:1 on glass
 * (amber: warning-ink on warning-soft ≈ 7.7:1).
 */
const TONE_CLASS: Record<Tone, string> = {
  critical: 'bg-critical-soft text-critical-ink',
  warning: 'bg-warning-soft text-warning-ink',
  active: 'bg-glass-strong text-ink-2',
  done: 'bg-success-soft text-success-ink',
  neutral: 'bg-glass-inner text-muted-foreground',
  info: 'bg-primary/12 text-link',
  follow: 'bg-secondary text-secondary-foreground',
};

/** The chip colours for a status value — for calendar chips and markers that are not a Badge. */
export function statusToneClass(value?: string | null): string {
  return TONE_CLASS[TONE_BY_VALUE[value ?? ''] ?? 'neutral'];
}

/** Stored values shown under a shorter screen label (the stored enum stays as is). */
const DISPLAY_LABEL: Record<string, string> = {
  'הוצעה ע״י הסוכנת': 'הוצעה',
  נקיימה: 'מומשה',
  'נקיימה חלקית': 'מומשה חלקית',
};

/** The screen label of a status value. */
export function statusLabel(value?: string | null): string {
  return DISPLAY_LABEL[value ?? ''] ?? value ?? '';
}

export function StatusBadge({ value, tone, className }: { value?: string | null; tone?: Tone; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const t = tone ?? TONE_BY_VALUE[value] ?? 'neutral';
  return (
    <Badge
      variant="outline"
      className={cn('h-6 gap-1.5 rounded-full border-transparent px-2.5 font-semibold', TONE_CLASS[t], className)}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {statusLabel(value)}
    </Badge>
  );
}