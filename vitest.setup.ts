// vitest setup for the app's test suite. Two things jsdom does not give us:
//
// 1. `@testing-library/jest-dom` — the DOM matchers (`toBeInTheDocument`, `toHaveClass`, …).
//    Without it those read as "Invalid Chai property" and every assertion using one fails.
// 2. `ResizeObserver` — jsdom implements no layout, so it ships no ResizeObserver, and the Radix
//    primitives under the shadcn components (Select, Popover, ScrollArea, Tooltip) construct one
//    on mount. Without it rendering any of them throws.
//
// Everything else the old harness polyfilled — TextEncoder/TextDecoder, fetch, requestAnimationFrame
// — the current jsdom/Node already provides, so it is not repeated here.
//
// Deliberately at the app root rather than under `test/`: every `.ts` file in `test/` round-trips to
// Blocks as an app `test` block, and this harness is boilerplate-owned — it must not become an app
// block that can drift from the boilerplate. Root files are not block paths, so it stays put.
import '@testing-library/jest-dom';
import ResizeObserver from 'resize-observer-polyfill';

globalThis.ResizeObserver = ResizeObserver;
