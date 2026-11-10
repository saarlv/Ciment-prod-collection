import { Link } from 'react-router';
import { SafeRedirect } from '@/components/SafeRedirect';
import { Button } from '@/components/ui/button';

/** "/" belongs to no mini-app: send everyone to the collections workspace (loop-guarded). */
export default function RootIndex() {
  return (
    <SafeRedirect
      to="/collections"
      fallback={
        <main className="flex min-h-[70vh] flex-col items-center justify-center gap-[13px] p-[21px] text-center">
          <h1 className="text-[34px] font-bold">מרחב הגבייה</h1>
          <p className="text-muted-foreground">ייתכן שהלשונית פתוחה על גרסה קודמת של האפליקציה.</p>
          <Button render={<Link to="/collections" />}>כניסה למרחב הגבייה</Button>
        </main>
      }
    />
  );
}