import * as BlocksClientReactSdk from '@blocksdiy/blocks-client-sdk/reactSdk';
import * as AgentChatPrimitive from '@blocksdiy/react-common/new-agent-chat';
import { cva } from 'class-variance-authority';
import { motion } from 'motion/react';
import * as React from 'react';
import { LiveContext, LiveError, LivePreview, LiveProvider } from 'react-live';
import * as Recharts from 'recharts';

import * as AccordionUI from '@/components/ui/accordion';
import * as AlertUI from '@/components/ui/alert';
import * as AlertDialogUI from '@/components/ui/alert-dialog';
import * as AspectRatioUI from '@/components/ui/aspect-ratio';
import * as AvatarUI from '@/components/ui/avatar';
import * as BadgeUI from '@/components/ui/badge';
import * as ButtonUI from '@/components/ui/button';
import * as CalendarUI from '@/components/ui/calendar';
import * as CardUI from '@/components/ui/card';
import * as CarouselUI from '@/components/ui/carousel';
import * as ChartUI from '@/components/ui/chart';
import * as CheckboxUI from '@/components/ui/checkbox';
import * as ComboboxUI from '@/components/ui/combobox';
import * as CommandUI from '@/components/ui/command';
import * as ContextMenuUI from '@/components/ui/context-menu';
import * as DialogUI from '@/components/ui/dialog';
import * as DropdownMenuUI from '@/components/ui/dropdown-menu';
import * as FieldUI from '@/components/ui/field';
import * as HoverCardUI from '@/components/ui/hover-card';
import * as InputUI from '@/components/ui/input';
import * as InputOtpUI from '@/components/ui/input-otp';
import * as LabelUI from '@/components/ui/label';
import * as NavigationMenuUI from '@/components/ui/navigation-menu';
import * as PopoverUI from '@/components/ui/popover';
import * as ProgressUI from '@/components/ui/progress';
import * as RadioGroupUI from '@/components/ui/radio-group';
import * as ResizableUI from '@/components/ui/resizable';
import * as ScrollAreaUI from '@/components/ui/scroll-area';
import * as SelectUI from '@/components/ui/select';
import * as SeparatorUI from '@/components/ui/separator';
import * as SheetUI from '@/components/ui/sheet';
import * as SidebarUI from '@/components/ui/sidebar';
import * as SkeletonUI from '@/components/ui/skeleton';
import * as SliderUI from '@/components/ui/slider';
import * as SwitchUI from '@/components/ui/switch';
import * as TableUI from '@/components/ui/table';
import * as TabsUI from '@/components/ui/tabs';
import * as TextareaUI from '@/components/ui/textarea';
import * as ToggleUI from '@/components/ui/toggle';
import * as ToggleGroupUI from '@/components/ui/toggle-group';
import * as TooltipUI from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import * as ProductTypes from '@/product-types';

// ─── agent chat component renderer ──────────────────────────────────────────

export type ChatComponentSize = 'sm' | 'md' | 'lg';

const ProductTypesContext = React.createContext<Record<string, unknown>>(
  ProductTypes as unknown as Record<string, unknown>,
);

export const AgentChatProductTypesProvider = ProductTypesContext.Provider;

// ─── Helpers ────────────────────────────────────────────────────────────────

const normalizeLiveCode = (code: string) => {
  const trimmed = code.trim();
  const fencedMatch = trimmed.match(
    /^```(?:tsx|jsx|typescript|javascript|ts|js)?\s*([\s\S]*?)\s*```$/,
  );
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed
    .replace(/^```(?:tsx|jsx|typescript|javascript|ts|js)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
};

const INVALID_LIVE_SCOPE_NAMES = new Set([
  'default',
  'import',
  'export',
  'class',
  'function',
  'return',
  'const',
  'let',
  'var',
]);

const sanitizeLiveScope = (scope: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(scope).filter(
      ([key]) =>
        /^[A-Za-z_$][\w$]*$/.test(key) && !INVALID_LIVE_SCOPE_NAMES.has(key),
    ),
  );

// CopilotKit delivers a completed HITL tool `result` as a JSON string. Parse
// it back into the structured payload the component originally passed to
// `respond(...)`; fall back to the raw value if it isn't JSON (or is absent).
const parseResult = (result: unknown): unknown => {
  if (typeof result !== 'string') {
    return result;
  }
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
};

const buildLiveScope = (
  componentProps: Record<string, unknown>,
  sendMessage: AgentChatPrimitive.AgentChatContextValue['sendMessage'],
  productTypes: Record<string, unknown>,
  respond?: (result: unknown) => Promise<void>,
  result?: unknown,
) =>
  sanitizeLiveScope({
    props: componentProps,
    React,
    Recharts,
    sendMessage,
    // Defined only for chat_components whose block has `userInterrupt: true`.
    // The component calls `respond(payload)` to resume the paused BE
    // `interrupt(...)`; CopilotKit forwards it as `Command(resume=payload)`.
    respond,
    // The payload the user previously sent via `respond(...)`, if any. On
    // reload the HITL tool call is replayed WITH its result, so this is
    // populated and the component can rehydrate its post-response state
    // (e.g. `useState(result ?? null)`) instead of starting fresh. Always
    // present in scope (even as `undefined`) so component code can reference
    // `result` without a ReferenceError.
    result,
    cn,
    BlocksClientReactSdk,
    ProductTypes: productTypes,
    ...AccordionUI,
    ...AlertUI,
    ...AlertDialogUI,
    ...AspectRatioUI,
    ...AvatarUI,
    ...BadgeUI,
    ...ButtonUI,
    ...CalendarUI,
    ...CardUI,
    ...CarouselUI,
    ...ChartUI,
    ...CheckboxUI,
    ...ComboboxUI,
    ...CommandUI,
    ...ContextMenuUI,
    ...DialogUI,
    ...DropdownMenuUI,
    ...FieldUI,
    ...HoverCardUI,
    ...InputUI,
    ...InputOtpUI,
    ...LabelUI,
    ...NavigationMenuUI,
    ...PopoverUI,
    ...ProgressUI,
    ...RadioGroupUI,
    ...ResizableUI,
    ...ScrollAreaUI,
    ...SelectUI,
    ...SeparatorUI,
    ...SheetUI,
    ...SidebarUI,
    ...SkeletonUI,
    ...SliderUI,
    ...SwitchUI,
    ...TableUI,
    ...TabsUI,
    ...TextareaUI,
    ...ToggleUI,
    ...ToggleGroupUI,
    ...TooltipUI,
  });

// ─── Variants ───────────────────────────────────────────────────────────────

const chatComponentErrorVariants = cva(
  'whitespace-pre-wrap font-sans text-sm leading-relaxed text-destructive/80',
  {
    variants: {
      size: {
        sm: 'px-2 pb-2',
        md: 'px-3 pb-3',
        lg: 'px-4 pb-4',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

// ─── Main component ─────────────────────────────────────────────────────────

/** Tells the caller react-live failed to compile or render the code. */
function LiveErrorReporter({ onError }: { onError: () => void }) {
  const { error } = React.useContext(LiveContext);
  React.useEffect(() => {
    if (error) {
      onError();
    }
  }, [error, onError]);
  return null;
}

interface ChatCodeComponentProps {
  code?: string;
  props?: Record<string, unknown>;
  status: AgentChatPrimitive.ToolCallStatus;
  size?: ChatComponentSize;
  respond?: (result: unknown) => Promise<void>;
  result?: unknown;
  onError?: () => void;
}

export function ChatCodeComponent({
  code,
  props,
  status: _status,
  size = 'md',
  respond,
  result,
  onError,
}: ChatCodeComponentProps) {
  const { sendMessage } = AgentChatPrimitive.useAgentChat();
  const sendMessageRef = React.useRef(sendMessage);

  React.useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const scopeSendMessage = React.useCallback(
    (props: Parameters<typeof sendMessage>[0]) => {
      return sendMessageRef.current(props);
    },
    [],
  );

  // Stabilise `respond` exactly like `sendMessage`. CopilotKit gives us a fresh
  // `respond` identity whenever the HITL status changes — and calling
  // `respond(...)` is what flips that status. If the raw `respond` flowed into
  // `scope`, that identity change would rebuild `scope`, re-transpile the
  // `noInline` LiveProvider code, and REMOUNT the rendered component — wiping
  // its local `useState` (e.g. an "answered" flag) on the very click that
  // called `respond`. The ref keeps the live `respond` current while
  // `stableResp-ond` stays referentially constant; the `hasRespondRef` latch
  // keeps a stable function even after `respond` goes undefined on Complete, so
  // the component never remounts across the Executing→Complete transition.
  const respondRef = React.useRef(respond);
  React.useEffect(() => {
    respondRef.current = respond;
  }, [respond]);

  const scopeRespond = React.useCallback(async (result: unknown) => {
    await respondRef.current?.(result);
  }, []);

  // Freeze the prior result at first mount. CopilotKit flips `result` from
  // undefined to the resume payload the moment `respond(...)` is called; if
  // that flowed into `scope`, it would rebuild the memo and REMOUNT the live
  // component on the very click that answered it — wiping the local state we
  // just set (same hazard the `scopeRespond` ref guards against). On reload it
  // is already populated so the component can rehydrate.
  const initialResultRef = React.useRef(parseResult(result));

  const productTypes = React.useContext(ProductTypesContext);
  const rawCode = code ?? '';
  const displayCode = rawCode ? normalizeLiveCode(rawCode) : '';
  // Memoised so `?? {}` doesn't break the `scope` memo's stable deps.
  const liveProps = React.useMemo(() => props ?? {}, [props]);
  const scope = React.useMemo(
    () =>
      buildLiveScope(
        liveProps,
        scopeSendMessage,
        productTypes,
        scopeRespond,
        initialResultRef.current,
      ),
    [liveProps, productTypes, scopeSendMessage, scopeRespond],
  );

  // `Executing` is the HITL-paused state — the tool's args are parsed and
  // the chat_component must render so the user can drive `respond(...)`.
  // const isCodeReady =
  //   Boolean(displayCode) &&
  //   (status === AgentChatPrimitive.ToolCallStatus.Complete ||
  //     status === AgentChatPrimitive.ToolCallStatus.Executing);

  // if (!isCodeReady) {
  //   return null;
  // }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <LiveProvider code={displayCode} scope={scope} noInline>
        <LivePreview />
        {onError ? (
          <LiveErrorReporter onError={onError} />
        ) : (
          <LiveError className={cn(chatComponentErrorVariants({ size }))} />
        )}
      </LiveProvider>
    </motion.div>
  );
}

// @blocks-registry agent-chat@2.1.0 — registry version, never edit this line