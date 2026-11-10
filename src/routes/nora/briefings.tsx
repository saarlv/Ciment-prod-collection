import { Link } from 'react-router';
import { SafeRedirect } from '@/components/SafeRedirect';
import { Button } from '@/components/ui/button';

/** Old links to /nora/briefings land on the morning briefings history at /collections/briefings. */
export default function NoraBriefingsMoved() {
  return (
    <SafeRedirect
      to="/collections/briefings"
      fallback={
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-[13px] p-6 text-center">
          <h1 className="text-[28px] font-extrabold">תדריכי הבוקר עברו</h1>
          <p className="text-sm text-muted-foreground">התדריכים נמצאים עכשיו במרחב הגבייה.</p>
          <Button nativeButton={false} render={<Link to="/collections/briefings" />}>
            לתדריכי הבוקר
          </Button>
        </div>
      }
    />
  );
}