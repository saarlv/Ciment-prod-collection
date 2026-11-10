import type { ReactNode } from 'react';
import { AlertCircleIcon, RotateCwIcon } from 'lucide-react';
import { AgentAvatar } from '@/components/AgentPanel';
import type { AgentPersona } from '@/components/AgentPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function LoadError({ what }: { what: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>לא הצלחנו לטעון את {what}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        בדקו את החיבור ונסו שוב. אם הבעיה נמשכת, פנו למנהל המערכת.
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RotateCwIcon data-icon="inline-start" />
          טעינה מחדש
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Honest empty state: says what the agent is waiting for. */
export function AgentEmpty({ title, children, agent }: { title: string; children: ReactNode; agent?: AgentPersona }) {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia>
          <AgentAvatar agent={agent} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-[13px]">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[34px] leading-[1.15] font-extrabold tracking-[-0.015em] md:text-[36px]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}