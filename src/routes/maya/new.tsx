import { AgentConversation } from '@/components/ui/agent-layout';

const SUGGESTIONS = [
  'אילו מיילים נכנסו היום ואיך סיווגת אותם?',
  'אילו פניות קרובות לחריגה מ-24 שעות?',
  'למה הפנייה האחרונה סומנה לא מאומת?',
  'מה מצב מנת החובות הפתוחים של החודש?',
];

export default function MayaNewChat() {
  return <AgentConversation suggestions={SUGGESTIONS} placeholder="שאלו את מאיה על מיילים, טיוטות או מנת החובות…" />;
}