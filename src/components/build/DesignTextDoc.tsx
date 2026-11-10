import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileTextIcon } from 'lucide-react';
import { DocTable, RichText, SectionTitle, StepNumber, SyncPointer, Tag } from '@/components/build/DesignParts';
import { cn } from '@/lib/utils';
import type { DocBlock, DocItem, DocSection, TextDoc } from '@/utils/buildDocs/docText';

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span className="flex min-w-0 flex-col gap-1.5">{children}</span>
    </li>
  );
}

/** An item's own text, its sub-points (bulleted or numbered) and the paragraph after them. */
function ItemBody({ item }: { item: DocItem }) {
  if (typeof item === 'string') return <RichText text={item} />;
  const SubList = item.ordered ? 'ol' : 'ul';
  return (
    <>
      <span>
        <RichText text={item.text} />
      </span>
      {item.sub && (
        <SubList className={cn('flex flex-col gap-1 border-s-2 border-primary/25 ps-[13px] text-[13px]', item.ordered ? 'list-decimal ps-8' : 'list-none')}>
          {item.sub.map((s) => (
            <li key={s}>
              <RichText text={s} />
            </li>
          ))}
        </SubList>
      )}
      {item.after && (
        <span className="text-[13px] text-ink-2">
          <RichText text={item.after} />
        </span>
      )}
    </>
  );
}

const itemKey = (item: DocItem) => (typeof item === 'string' ? item : item.text);

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <p className="text-sm leading-relaxed text-ink-2">
          <RichText text={block.text} />
        </p>
      );
    case 'h3':
      return (
        <h3 className="pt-1 text-base font-bold text-foreground first:pt-0">
          <RichText text={block.text} />
        </h3>
      );
    case 'list':
      return (
        <ul className="flex flex-col gap-2">
          {block.items.map((item) => (
            <Bullet key={itemKey(item)}>
              <ItemBody item={item} />
            </Bullet>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <li key={itemKey(item)} className="flex items-start gap-[13px] rounded-[18px] bg-glass-card px-[13px] py-2.5 text-sm leading-relaxed text-ink-2">
              <StepNumber n={i + 1} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                <ItemBody item={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <DocTable head={block.head} rows={block.rows.map((r) => r.map((c, i) => <RichText key={i} text={c} />))} />
        </div>
      );
  }
}

/**
 * A text-first Design doc (04 · פניות, סוכנים), in the style of Design 01–03: the hero header, the sync pointer, then
 * one numbered section per `##` of the source, each a glass card with its paragraphs, lists, steps and tables.
 */
export function DesignTextDoc({
  doc,
  icons,
  heroIcon: HeroIcon = FileTextIcon,
  cross,
  renderSection,
}: {
  doc: TextDoc;
  icons: LucideIcon[];
  heroIcon?: LucideIcon;
  cross?: boolean;
  /** A custom body for one section (under its numbered title), in place of the glass card; return undefined to keep the default. */
  renderSection?: (section: DocSection, index: number) => ReactNode;
}) {
  return (
    <article className="flex flex-col gap-[34px]">
      <header className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <span className="text-xs font-semibold text-muted-foreground">Design · {doc.date}</span>
        <div className="flex items-end gap-[13px]">
          {doc.number ? (
            <span className="text-[54px] leading-none font-extrabold tracking-[-0.03em] text-ink-2 tabular-nums">{doc.number}</span>
          ) : (
            <span className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-glass-strong text-link shadow-glass-pill">
              <HeroIcon className="size-6" />
            </span>
          )}
          <h2 className="pb-1 text-[30px] leading-tight font-extrabold tracking-[-0.015em]">{doc.title}</h2>
        </div>
        <p className="max-w-[560px] text-sm text-ink-2">{doc.lead}</p>
        <div className="flex flex-wrap gap-1.5">
          {cross && <Tag className="bg-primary/12 text-link">חוצה רכיבים</Tag>}
          {doc.tags.map((t) => (
            <Tag key={t} className="bg-glass-strong text-ink-2">
              {t}
            </Tag>
          ))}
        </div>
      </header>

      {doc.sync && <SyncPointer text={doc.sync} />}

      {doc.sections.map((s, i) => (
        <section key={s.title} aria-label={s.title} className="flex flex-col gap-[13px]">
          <SectionTitle n={i + 1} title={s.title} icon={icons[i] ?? FileTextIcon} />
          {renderSection?.(s, i) ?? (
            <div className="glass flex min-w-0 flex-col gap-[13px] rounded-[26px] border p-[21px] md:p-[34px]">
              {s.blocks.map((b, j) => (
                <Block key={j} block={b} />
              ))}
            </div>
          )}
        </section>
      ))}
    </article>
  );
}