import type { LucideIcon } from 'lucide-react';
import { CircleCheckIcon, HandCoinsIcon, MessageSquareTextIcon, ScaleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NOTE_LABEL, TONE_CLASS, TYPE_TONE } from '@/utils/AgingPanel';
import type { NoteType } from '@/utils/AgingPanel';

const TYPE_ICON: Record<NoteType, LucideIcon> = {
  'הבטחת תשלום': HandCoinsIcon,
  'שולם לטענת הלקוח': CircleCheckIcon,
  'בבירור – מחלוקת': ScaleIcon,
  הערה: MessageSquareTextIcon,
};

export function NoteTypeIcon({ type, className }: { type: NoteType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon aria-hidden className={className} />;
}

/** The note's type as a soft chip with its icon (בירור amber, הבטחה blue, שולם green, general neutral). */
export function NoteTypeBadge({ type, className }: { type: NoteType; className?: string }) {
  return (
    <Badge variant="outline" className={cn('h-6 gap-1 rounded-full px-2 font-semibold', TONE_CLASS[TYPE_TONE[type]], className)}>
      <NoteTypeIcon type={type} />
      {NOTE_LABEL[type]}
    </Badge>
  );
}