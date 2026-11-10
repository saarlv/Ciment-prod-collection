import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useEntityGetOne } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { InboundEmailsEntity } from '@/product-types';
import { PageHeader } from '@/components/PageStates';
import { AutomationsTab } from '@/components/inbox/AutomationsTab';
import { EmailDrawer } from '@/components/inbox/EmailDrawer';
import { InboxMailTab } from '@/components/inbox/InboxMailTab';
import { InboxTabs, isInboxTab } from '@/components/inbox/InboxTabs';
import { OutboxTab } from '@/components/inbox/OutboxTab';
import type { InboundEmail } from '@/utils/Inbox';

const DESCRIPTION: Record<string, string> = {
  inbox: 'כל מייל שנכנס לתיבות הנהלת החשבונות. מאיה ממיינת, הקוד מכין את הקרקע, ואתם מאשרים.',
  outbox: 'כל טיוטה מכל רכיב. אישור מסמן ״אושר – לא נשלח״: שום דבר לא נשלח מהאפליקציה.',
  automations: 'מיילים קבועים שמוכנים לבד כטיוטות, עם תצוגה מקדימה והיסטוריה.',
};

/** Re-renders once a minute so the 24-hour rings keep moving. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * /collections/inbox — פניות: ?tab=inbox|outbox|automations (default inbox). Inbox: ?folder=, ?state=, ?mailbox=,
 * ?bookkeeper=, ?customer=. Outbox: ?status=, ?component=, ?mailbox=, ?batch=, ?draft=. Any tab: ?email=<InboundEmails id> opens the mail panel.
 */
export default function InboxPage() {
  const now = useMinuteClock();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = isInboxTab(raw) ? raw : 'inbox';
  const openId = params.get('email');
  const email = useEntityGetOne(InboundEmailsEntity, { id: openId ?? '' }, { enabled: !!openId });

  function openEmail(id: string) {
    const next = new URLSearchParams(params);
    next.set('email', id);
    setParams(next);
  }
  function closeEmail() {
    const next = new URLSearchParams(params);
    next.delete('email');
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageHeader title="פניות" description={DESCRIPTION[tab]} />
      <InboxTabs />
      {tab === 'inbox' && <InboxMailTab now={now} onOpen={openEmail} />}
      {tab === 'outbox' && <OutboxTab />}
      {tab === 'automations' && <AutomationsTab />}
      <EmailDrawer
        email={email.data as InboundEmail | undefined}
        open={!!openId}
        onOpenChange={(o) => !o && closeEmail()}
        isLoading={email.isLoading}
        now={now}
      />
    </>
  );
}