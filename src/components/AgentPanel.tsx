import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SparklesIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCardAgent } from '@/hooks/useCardAgent';
import { useCollectionsAgent } from '@/hooks/useCollectionsAgent';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Who a surface belongs to: the system itself (calculations in code — aging, promises, insurance, the
 * morning run; the default, shown without a persona), Nina (receipts), Maya (the inbox) or Tamar (the customer card).
 */
export type AgentPersona = 'system' | 'nina' | 'maya' | 'tamar';

/** The label of a system surface: no agent, the numbers come from code. */
const SYSTEM_NAME = 'סיכום אוטומטי';

const AGENT_ROLE: Record<AgentPersona, string> = {
  system: 'מחושב מהחשבוניות, ההערות, ההבטחות ושורות הבנק',
  nina: 'מזהה את הלקוח של כל העברה, מוציאה קבלה, בודקת את החוב מול החודשים ומפזרת לחשבוניות',
  maya: 'קוראת את המיילים בתיבות, מסווגת, מאמתת שולחים ומכינה טיוטות מענה',
  tamar: 'כותבת כל בוקר סיכום קצר ללקוח, ורושמת את מה שמספרים לה עליו',
};

/** Identity of any of the agents, from the platform via useAgent. */
function usePersona(agent: AgentPersona): { name: string; jobTitle: string; photo?: string } {
  const nina = useCollectionsAgent();
  const maya = useInboxAgent();
  const tamar = useCardAgent();
  if (agent === 'system') return { name: SYSTEM_NAME, jobTitle: '' };
  if (agent === 'tamar') return tamar;
  return agent === 'maya' ? maya : nina;
}

const AGENT_AVATAR_SIZE = { sm: 'size-7', default: 'size-9', lg: 'size-11' } as const;

/**
 * The neutral marker of a system surface (no agent): a calm glass circle with an icon — sparkle by
 * default, or one that says what the surface is (a calendar, a shield).
 */
export function SystemMark({
  size = 'default',
  className,
  icon: Icon = SparklesIcon,
}: {
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        AGENT_AVATAR_SIZE[size],
        'flex shrink-0 items-center justify-center rounded-full bg-glass-strong text-ink-2 shadow-glass-pill ring-2 ring-glass-edge',
        className,
      )}
    >
      <Icon className="size-[45%]" />
    </span>
  );
}

/**
 * The agent's photo — one crop, ring and shadow everywhere; the sparkle circle is the loading fallback. A system
 * surface gets the neutral SystemMark.
 */
export function AgentAvatar({
  size = 'default',
  className,
  agent = 'system',
}: {
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  agent?: AgentPersona;
}) {
  const { name, photo } = usePersona(agent);
  if (agent === 'system') return <SystemMark size={size} className={className} />;
  return (
    <Avatar
      className={cn(
        AGENT_AVATAR_SIZE[size],
        'shadow-glass-pill ring-2 ring-glass-edge after:hidden',
        className,
      )}
    >
      {photo && <AvatarImage src={photo} alt={name} className="object-cover object-top" />}
      <AvatarFallback className="bg-foreground text-background">
        <SparklesIcon className="size-[45%]" />
      </AvatarFallback>
    </Avatar>
  );
}

/** The agent's name + role line, used at the top of every agent surface. */
function AgentIdentity({ subtitle, agent }: { subtitle?: ReactNode; agent: AgentPersona }) {
  const { name, jobTitle } = usePersona(agent);
  return (
    <div className="flex items-center gap-[13px]">
      <AgentAvatar size="lg" agent={agent} />
      <div className="flex flex-col leading-tight">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{name}</span>
          {jobTitle && <span className="text-[13px] text-muted-foreground">{jobTitle}</span>}
        </div>
        <span className="text-[13px] text-muted-foreground">{subtitle ?? AGENT_ROLE[agent]}</span>
      </div>
    </div>
  );
}

/** The hero panel every screen opens with: what the agent did and recommends. */
export function AgentPanel({
  headline,
  description,
  subtitle,
  children,
  className,
  agent = 'system',
  lift = true,
}: {
  agent?: AgentPersona;
  headline: ReactNode;
  description?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Deeper shadow on hover; off on screens that must stay perfectly still (the aging report). */
  lift?: boolean;
}) {
  return (
    <Card className={cn('glass-hero gap-[21px] [--card-spacing:21px] md:[--card-spacing:34px]', lift && 'glass-lift', className)}>
      <CardHeader className="flex flex-col gap-[13px]">
        <AgentIdentity subtitle={subtitle} agent={agent} />
        <CardTitle className="text-[21px] leading-[1.4] font-bold md:text-[22px]">{headline}</CardTitle>
        {description && <CardDescription className="text-sm">{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent className="flex flex-col gap-[21px]">{children}</CardContent>}
    </Card>
  );
}