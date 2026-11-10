/**
 * Class names of the aging report's v2 look (Saar's approved reference, 27.10), shared by the report,
 * its toolbar and the notes drawer so they stay one design. Colors are the `--ag-*` tokens in index.css.
 */

/** Primary action: cobalt fill, white text, radius 6. One per surface. */
export const AG_PRIMARY_BTN =
  'rounded-[6px] border-transparent bg-ag-cobalt px-[14px] font-semibold text-ag-on-cobalt shadow-none hover:bg-ag-cobalt-dark focus-visible:ring-ag-cobalt/40';

/** Secondary action: white with the #D9DEE7 border, radius 6. */
export const AG_SECONDARY_BTN =
  'rounded-[6px] border border-ag-btn-border bg-ag-surface px-[14px] font-normal text-ag-ink shadow-none hover:bg-ag-page hover:text-ag-ink aria-pressed:bg-ag-cobalt-tint aria-pressed:text-ag-cobalt dark:bg-ag-surface';

/** 44×44 icon-only tool button of the report's header bar. */
export const AG_ICON_BTN =
  'size-11 rounded-[6px] border border-ag-btn-border bg-ag-surface text-ag-ink shadow-none hover:bg-ag-page hover:text-ag-ink dark:bg-ag-surface [&_svg:not([class*=size-])]:size-5';

/** Single-choice chips and toggles (note type, payment method, dispute subject): reference tags, pressed = cobalt tint. */
export const AG_TOGGLE =
  'rounded-[6px] border-ag-btn-border bg-ag-surface text-ag-ink hover:bg-ag-page aria-pressed:border-ag-cobalt/40 aria-pressed:bg-ag-cobalt-tint aria-pressed:text-ag-cobalt';

/** A white card of the report (radius 8, 1px #E3E7EE border). */
export const AG_CARD = 'rounded-[8px] border border-ag-border bg-ag-surface';

/** Popover / menu surface in the report's look. */
export const AG_MENU = 'rounded-[12px] border border-ag-btn-border bg-ag-surface text-ag-ink shadow-lg ring-0';