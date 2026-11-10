import { Link } from 'react-router';
import { SafeRedirect } from '@/components/SafeRedirect';
import { Button } from '@/components/ui/button';

/** /nora no longer exists (the aging and promises work is done by code on the collections screens): old links land on /collections. */
export default function NoraGone() {
  return (
    <SafeRedirect
      to="/collections"
      fallback={
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-[13px] p-6 text-center">
          <h1 className="text-[28px] font-extrabold">הדף הזה הוסר</h1>
          <p className="text-sm text-muted-foreground">דוח הגיול, ההבטחות וביטוח האשראי נמצאים במרחב הגבייה.</p>
          <Button nativeButton={false} render={<Link to="/collections" />}>
            למרחב הגבייה
          </Button>
        </div>
      }
    />
  );
}