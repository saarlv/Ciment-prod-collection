import type { ComponentProps } from 'react';
import { Streamdown } from 'streamdown';
import type { Components, ExtraProps } from 'streamdown';
import { ListIcon, MapIcon } from 'lucide-react';
import { Tag } from '@/components/build/DesignParts';
import { cn } from '@/lib/utils';
import { PLAN_MARKDOWN } from '@/utils/buildDocs/plan';

type Chapter = { id: string; title: string; body: string };

/** Splits the plan at its `## ` headings (ignoring lines inside code fences): the `# ` title, the preamble before the first chapter, and the chapters. */
function splitPlan(md: string): { title: string; intro: string; chapters: Chapter[] } {
  let title = '';
  const intro: string[] = [];
  const chapters: { title: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith('## ')) {
      chapters.push({ title: line.slice(3).trim(), lines: [] });
      continue;
    }
    if (!inFence && !title && chapters.length === 0 && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    if (chapters.length) chapters[chapters.length - 1].lines.push(line);
    else intro.push(line);
  }
  return {
    title,
    intro: intro.join('\n').trim(),
    chapters: chapters.map((c, i) => ({ id: `plan-ch-${i + 1}`, title: c.title, body: c.lines.join('\n').trim() })),
  };
}

const PLAN = splitPlan(PLAN_MARKDOWN);

type P<T extends keyof React.JSX.IntrinsicElements> = ComponentProps<T> & ExtraProps;

/** Markdown elements in the Liquid+ glass style; tables scroll sideways, code (mermaid too) is a plain LTR block. */
const MD: Components = {
  h1: ({ node: _n, className, ...p }: P<'h1'>) => <h3 className={cn('mt-4 text-lg font-bold first:mt-0', className)} {...p} />,
  h2: ({ node: _n, className, ...p }: P<'h2'>) => <h3 className={cn('mt-4 text-lg font-bold first:mt-0', className)} {...p} />,
  h3: ({ node: _n, className, ...p }: P<'h3'>) => <h3 className={cn('mt-4 text-base font-bold first:mt-0', className)} {...p} />,
  h4: ({ node: _n, className, ...p }: P<'h4'>) => <h4 className={cn('mt-3 text-sm font-bold first:mt-0', className)} {...p} />,
  h5: ({ node: _n, className, ...p }: P<'h5'>) => <h5 className={cn('mt-3 text-sm font-semibold first:mt-0', className)} {...p} />,
  h6: ({ node: _n, className, ...p }: P<'h6'>) => <h6 className={cn('mt-3 text-sm font-semibold first:mt-0', className)} {...p} />,
  p: ({ node: _n, className, ...p }: P<'p'>) => <p className={cn('text-sm leading-relaxed text-ink-2', className)} {...p} />,
  strong: ({ node: _n, className, ...p }: P<'strong'>) => <strong className={cn('font-semibold text-foreground', className)} {...p} />,
  a: ({ node: _n, className, ...p }: P<'a'>) => <a className={cn('text-link underline underline-offset-4 hover:no-underline', className)} target="_blank" rel="noreferrer" {...p} />,
  ul: ({ node: _n, className, ...p }: P<'ul'>) => <ul className={cn('flex list-disc flex-col gap-1 ps-5 text-sm leading-relaxed text-ink-2 marker:text-link', className)} {...p} />,
  ol: ({ node: _n, className, ...p }: P<'ol'>) => <ol className={cn('flex list-decimal flex-col gap-1 ps-5 text-sm leading-relaxed text-ink-2 marker:text-muted-foreground', className)} {...p} />,
  li: ({ node: _n, className, ...p }: P<'li'>) => <li className={cn('ps-1 [&>ol]:mt-1 [&>ul]:mt-1', className)} {...p} />,
  blockquote: ({ node: _n, className, ...p }: P<'blockquote'>) => (
    <blockquote className={cn('flex flex-col gap-2 rounded-[18px] border-s-4 border-primary bg-primary/[0.06] px-[13px] py-2.5 [&_p]:text-[13px]', className)} {...p} />
  ),
  hr: ({ node: _n, className, ...p }: P<'hr'>) => <hr className={cn('my-2 border-glass-edge', className)} {...p} />,
  table: ({ node: _n, className, ...p }: P<'table'>) => (
    <div className="max-w-full overflow-x-auto rounded-[18px] bg-glass-card">
      <table className={cn('w-full min-w-[620px] border-collapse text-[13px]', className)} {...p} />
    </div>
  ),
  thead: ({ node: _n, className, ...p }: P<'thead'>) => <thead className={cn('border-b border-glass-edge', className)} {...p} />,
  tr: ({ node: _n, className, ...p }: P<'tr'>) => <tr className={cn('border-b border-glass-edge align-top last:border-b-0 hover:bg-glass-faint', className)} {...p} />,
  th: ({ node: _n, className, ...p }: P<'th'>) => <th className={cn('px-[13px] py-2 text-start text-xs font-semibold whitespace-nowrap text-muted-foreground', className)} {...p} />,
  td: ({ node: _n, className, ...p }: P<'td'>) => <td className={cn('px-[13px] py-2 text-start align-top leading-relaxed text-ink-2', className)} {...p} />,
  pre: ({ node: _n, className, ...p }: P<'pre'>) => (
    <pre dir="ltr" className={cn('max-w-full overflow-x-auto rounded-[18px] bg-glass-card p-[13px] text-start font-mono text-xs leading-relaxed text-ink-2 [&_code]:bg-transparent [&_code]:p-0', className)} {...p} />
  ),
  code: ({ node: _n, className, ...p }: P<'code'>) => <code className={cn('rounded-md bg-glass-inner px-1 py-0.5 font-mono text-[0.85em] text-ink-2', className)} {...p} />,
};

function PlanMarkdown({ children }: { children: string }) {
  return (
    <Streamdown mode="static" dir="auto" components={MD} controls={false} className="flex min-w-0 flex-col gap-3">
      {children}
    </Streamdown>
  );
}

function scrollToChapter(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Design · תוכנית — the full builder plan (memories/files/BUILDER_PLAN-full.md), one glass card per `## ` chapter, with a table of contents. */
export function DesignPlanDoc() {
  return (
    <article className="flex flex-col gap-[34px]">
      <header className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <span className="text-xs font-semibold text-muted-foreground">Design · התוכנית המלאה</span>
        <div className="flex items-end gap-[13px]">
          <span className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-glass-strong text-link shadow-glass-pill">
            <MapIcon className="size-6" />
          </span>
          <h2 dir="auto" className="pb-1 text-[26px] leading-tight font-extrabold tracking-[-0.015em]">
            {PLAN.title || 'התוכנית המלאה'}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag className="bg-primary/12 text-link">חוצה רכיבים</Tag>
          <Tag className="bg-glass-strong text-ink-2">{PLAN.chapters.length} פרקים</Tag>
        </div>
        {PLAN.intro && <PlanMarkdown>{PLAN.intro}</PlanMarkdown>}
      </header>

      <nav aria-label="תוכן העניינים" className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px] md:p-[34px]">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <ListIcon className="size-5 text-muted-foreground" />
          תוכן העניינים
        </h2>
        <ol className="grid gap-1 md:grid-cols-2">
          {PLAN.chapters.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => scrollToChapter(c.id)}
                className="flex w-full items-start gap-2 rounded-[14px] px-2.5 py-1.5 text-start text-[13px] text-ink-2 outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="w-5 shrink-0 font-bold text-link tabular-nums">{i + 1}</span>
                <span dir="auto" className="min-w-0">
                  {c.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {PLAN.chapters.map((c, i) => (
        <section key={c.id} id={c.id} aria-label={c.title} className="flex scroll-mt-[90px] flex-col gap-[13px]">
          <div className="flex items-center gap-[13px]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-glass-strong text-sm font-extrabold text-link shadow-glass-pill tabular-nums">{i + 1}</span>
            <h2 dir="auto" className="min-w-0 text-xl font-bold">
              {c.title}
            </h2>
          </div>
          <div className="glass flex min-w-0 flex-col gap-3 rounded-[26px] border p-[21px] md:p-[34px]">
            {c.body ? <PlanMarkdown>{c.body}</PlanMarkdown> : <p className="text-sm text-muted-foreground">אין תוכן בפרק זה.</p>}
          </div>
        </section>
      ))}
    </article>
  );
}