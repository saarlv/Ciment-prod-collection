import { RouteMoved } from '@/components/RouteMoved';

/** /collections/inbox/open-debts moved: the monthly open-debts mail is an automation on the פניות automations tab. */
export default function OpenDebtsMoved() {
  return <RouteMoved to="/collections/inbox?tab=automations" title="מנת החובות הפתוחים" />;
}