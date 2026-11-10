import { AgentConversation } from '@/components/ui/agent-layout';

const SUGGESTIONS = [
  'מה מצב הבדיקות של שורות הבנק היום?',
  'אילו רשומות לא זוהו ולמה?',
  'איך מזהים מעביר שאין לו כרטיס לקוח?',
  'למה 17,424 הותאם לשלוש חשבוניות?',
];

export default function NinaNewChat() {
  return <AgentConversation suggestions={SUGGESTIONS} placeholder="שאלו את נינה על תקבולים ועל שורות הבנק…" />;
}