# App agents — identity and chat

Agents are the app's AI teammates, created in the Logic section. `useAgent` reads an agent's identity; `useAgentChat` drives a conversation.

## useAgent — agent identity

For agent profile cards, chat headers, sidebars, assigned-agent UI, team lists — anywhere the persona appears. Destructure the fields directly off the returned object; `agent.getAgentProps()` is deprecated.

```tsx
import { useAgent } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CustomerSupportAgent } from '@/product-types';

const { title, jobTitle, avatarUrl, photoUrl } = useAgent(CustomerSupportAgent);
```

- `title` — persona display name (e.g. "Leo"); unset on a brand-new agent, so fall back to `jobTitle`
- `jobTitle` — role title (e.g. "Support Specialist")
- `avatarUrl` / `photoUrl` — persona images. Render the avatar with `avatarUrl ?? photoUrl` as the src and initials from the display name as the fallback, so it always shows something specific to this agent.
- `id` — identifier, never displayed. There is no `name`, `harness`, `appId`, or `token`.

A hardcoded title, job title, or avatar misrepresents a real configured persona, and a generic `Sparkles` / `Bot` / `Wand` icon in a chat header throws the persona away. When a generated agent exists, import its constant from `@/product-types` and render `useAgent()` values — or omit the avatar entirely and show a clean title.

## AI agent chat

The chat surface is the Blocks **AgentChat** component — a full conversation UI (streaming markdown, tool cards, human-in-the-loop prompts, inline chat components, attachments) over the platform chat runtime. `AgentChatSimple` is the single-conversation surface — what embedded chats use, and what people who don't get an agent mini-app's layout chat through. Install it from the local Blocks registry if `src/components/ui/agent-chat.tsx` does not exist yet:

```bash
yes n | CI=1 pnpm dlx shadcn@4.23.0 add ./.blocks-registry/agent-chat.json -y
```

```tsx
import { useAgentChat } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AgentChatSimple } from '@/components/ui/agent-chat';
import { CustomerSupportChatAgentChat } from '@/product-types';

function ChatPage() {
  // artifacts/agent-chats/CustomerSupportChat.json → CustomerSupportChatAgentChat
  const agentChat = useAgentChat(CustomerSupportChatAgentChat);

  return (
    <div className="h-[calc(100vh-8rem)] overflow-hidden rounded-lg border">
      <AgentChatSimple
        agentChat={agentChat}
        size="lg" // 'sm' | 'md' | 'lg' (text size, not container)
        chatContext={{ orderId: '123' }} // context sent with every message
        suggestions={['Show open orders', 'Draft a status update']} // starter prompts on an empty conversation
      />
    </div>
  );
}
```

### Conversations (threads)

A conversation is one thread of the agent, identified by the agent and a thread id. Every chat surface of the same agent shows the same conversations; an agent-chat block configures only the experience (initial messages, initial prompt, attachments), never which conversations exist.

- **No thread id** (the default): a signed-in user resumes their most recent conversation with this agent; an anonymous visitor starts a new conversation on every mount. To resume for visitors, store the thread id yourself and pass it back as `defaultThreadId`.
- **One conversation per record** (a chat per order, per ticket): pass `defaultThreadId` — a stable UUID per record; the chat runtime accepts only UUIDs. `legacyChatThreadId(key)` from `@blocksdiy/react-common/agent-threads` returns the same UUID for the same string key: `defaultThreadId={legacyChatThreadId('order-' + order.id)}`. A UUID column on the record works too.
- **Who sees which conversations**: every user of the app sees all of the agent's conversations by default, in a mini-app's conversation list (`AgentChatSimple` lists nothing; it opens one conversation). `private` on `AgentLayout` shows each signed-in user only their own (the `agent-mini-apps` skill). It is a display filter, not access control — the caller chooses it. When users must not see each other's conversations (health data, HR, one client per user), set `private`, and tell the user plainly that it filters the UI rather than securing the data.

- Give the chat surface a container with a defined height and `overflow-hidden`, or the transcript grows unbounded instead of scrolling.
- `useAgentChat` + `AgentChat` is the only supported pairing. `MessageScroller`, `Message`, and `Bubble` are human-to-human messaging primitives and cannot render agent tool calls, interrupts, or streamed AG-UI events.
- **`AgentChatSimple` with the props above is the whole supported surface.** `suggestions`, `placeholder`, and `emptyState` are also props. The internals it is built from (`AgentChatRoot`, `AgentChatInput`, …) are `@blocksdiy/react-common` implementation details whose shape changes between platform releases — composing them directly, or reading their `.d.ts` to try, produces code the next platform update breaks. If the chat needs something `AgentChatSimple` doesn't expose, build it in the page around the chat instead. One measured build spent 12 round-trips and three `pnpm add` cycles hunting `AgentChatInputProps` through `node_modules`.
- Never install or re-pin `@blocksdiy/*` packages (`pnpm add @blocksdiy/react-common@latest` and the like). Platform packages are version-locked to the runtime; moving one desyncs the app from the platform that hosts it.
- The page around the chat — title bar, breadcrumb, hero, sidebar entry — is yours to design.

## Floating agent chat — talk to an agent without leaving the page

The app's ONE **floating agent chat**: a conversation with an agent in a panel over the page (`floating-agent-chat.tsx`, in the `agent-chat` item). It needs `FloatingAgentChatProvider` once in the layout that wraps the whole app (the `app-layout` skill). Open it from a page:

```tsx
import { useAgentChat } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { newChatHref, threadHref } from '@/components/ui/agent-layout-context';
import { Button } from '@/components/ui/button';
import { useFloatingAgentChat } from '@/components/ui/floating-agent-chat';
import { BillingAssistantPageChatAgentChat } from '@/product-types';

function AskTheoButton() {
  const agentChat = useAgentChat(BillingAssistantPageChatAgentChat); // this surface's own block
  const floatingAgentChat = useFloatingAgentChat();
  return (
    <Button
      variant="outline"
      onClick={() =>
        floatingAgentChat.open({
          agentChat,
          chatContext: { page: 'open-invoices' }, // optional, sent with every turn
          // Only when Theo has a mini-app (here at /theo): its conversation route and its new
          // chat, so the panel can expand to the full page. Without them the panel has no expand.
          expandHref: (conversation) =>
            threadHref('/theo', conversation.chatThreadId),
          newChatHref: newChatHref('/theo'),
        })
      }
    >
      Ask Theo
    </Button>
  );
}
```

- `open({ agentChat, target?, expandHref?, newChatHref?, chatContext? })`: no `target` opens the new chat; `{ chatThreadId }` picks up a conversation; `expandHref(conversation)` names a conversation's full route and `newChatHref` the full-page new chat, where **expand** goes while nothing is sent (without the one for what it shows, the panel has no expand); `chatContext` as on `AgentChatSimple` — over the provider's own `chatContext` (the app's, for every floating conversation), and every turn also carries `urlContext` (the page's route params and search params) beside them. `close()`, `isOpen`, `state`. (`openPrompt({ agent? })`, seen in older pages, opens the same panel on a new chat with one of the provider's `agents`; write `open` instead.)
- **The agent sees the page already**: every floating turn carries the URL (`urlContext`) and each mounted `useEntityGetAll` / `useEntityGetOne` (`onScreen`: table and query). For state they don't carry — a computed total, the selection (ids), a dialog's step, a draft — the component that owns it calls `useAgentContext('RevenueChart', { total, period })` (`@blocksdiy/blocks-client-sdk/reactSdk`), and the agent sees `RevenueChart: [{ total, period }]` while it is mounted. A few keys, as the user sees them; never per list row, never rows the page reads or URL state. Both reach the agent from agent-chat 1.1.0: when this turn's notes list agent-chat as behind, apply its update first.
- Signed-in users only (the mini-app layout's gate): the panel throws otherwise, so in a public app call `open()` only when `useUser().isAuthenticated` is true.
- Inside an agent mini-app use the layout's own pick instead: `useAgentLayout().openConversation(…)` (the `agent-mini-apps` skill).
- Never a second `FloatingAgentChat`. `AgentChatSimple` remains the chat that lives IN a page.

## Agent mini-apps

An agent route in your brief's `ENTRY ROUTES` is an **agent mini-app**, built with the `agent-layout` registry item. **The `agent-mini-apps` skill is the contract — install, folder, who sees what in `layout.tsx`, which handle goes where; load it before touching one.**

What belongs here: a chat embedded anywhere else (a dashboard widget, a page) uses its own handle (e.g. `<Agent>WidgetChatAgentChat`) — never the layout's. A handle you need but the brief doesn't name is a missing artifact: report it rather than substituting another.

## Prebuilt chat components

Components that render inline _inside_ an agent chat (rather than on a page) live in `chat-components/` and are built by the `chat-components` subagent, not here. They are app-wide: every agent-chat can show every component.
