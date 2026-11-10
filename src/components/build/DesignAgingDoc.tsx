import { CalendarClockIcon, CompassIcon, DatabaseIcon, LandmarkIcon, ListChecksIcon, MessageSquareTextIcon, MonitorIcon, ScaleIcon, SearchIcon, SparklesIcon } from 'lucide-react';
import { RichText } from '@/components/build/DesignParts';
import { DesignTextDoc } from '@/components/build/DesignTextDoc';
import type { DocItem, DocSection } from '@/utils/buildDocs/docText';
import { DESIGN_AGING } from '@/utils/buildDocs/designAging';

/** The screens section's title prefix (section 7, from a/aging-screens). */
const SCREENS_TITLE = 'המסכים';

interface ScreenGroup {
  title: string;
  items: DocItem[];
}

/**
 * Section 7 (the screens) as master laid it out: the lead as a callout, one glass card per screen group (an h3 and
 * its list), and the closing note. Read from the section's blocks, so the text stays the .md's word for word.
 */
function ScreensBody({ section }: { section: DocSection }) {
  const leads: string[] = [];
  const notes: string[] = [];
  const groups: ScreenGroup[] = [];
  for (const b of section.blocks) {
    if (b.type === 'h3') groups.push({ title: b.text, items: [] });
    else if (b.type === 'list' && groups.length) groups[groups.length - 1].items.push(...b.items);
    else if (b.type === 'p') (groups.length ? notes : leads).push(b.text);
  }
  return (
    <>
      {leads.map((t) => (
        <p key={t} className="max-w-[760px] rounded-[18px] border-s-4 border-primary bg-primary/[0.06] px-[13px] py-2.5 text-[13px] leading-relaxed text-ink-2">
          <RichText text={t} />
        </p>
      ))}
      <div className="grid items-start gap-[13px] lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="glass flex min-w-0 flex-col gap-2.5 rounded-[26px] border p-[13px] md:p-[21px]">
            <h3 className="text-sm font-bold">{g.title}</h3>
            <ul className="flex flex-col gap-2">
              {g.items.map((item) => {
                const text = typeof item === 'string' ? item : item.text;
                return (
                  <li key={text} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-2">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-2/50" />
                    <span>
                      <RichText text={text} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {notes.map((t) => (
        <p key={t} className="rounded-[18px] bg-glass-inner px-[13px] py-2.5 text-[13px] leading-relaxed text-ink-2">
          <RichText text={t} />
        </p>
      ))}
    </>
  );
}

/**
 * Design 02 · דוח גיול והערות: a text-first doc (rewritten 05.11.2026), one icon per `##` section of the source (10).
 * Section 7, the screens (a/aging-screens), keeps master's layout: lead callout, a card per screen, the closing note.
 */
export function DesignAgingDoc() {
  return (
    <DesignTextDoc
      doc={DESIGN_AGING}
      icons={[LandmarkIcon, SparklesIcon, CalendarClockIcon, MessageSquareTextIcon, ScaleIcon, ListChecksIcon, MonitorIcon, CompassIcon, DatabaseIcon, SearchIcon]}
      renderSection={(s) => (s.title.startsWith(SCREENS_TITLE) ? <ScreensBody section={s} /> : undefined)}
    />
  );
}