import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export default function CollectionsNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-[13px] text-center">
      <h1 className="text-[34px] font-bold">הדף לא נמצא</h1>
      <p className="text-muted-foreground">הדף שחיפשתם לא קיים או שהועבר.</p>
      <Button render={<Link to="/collections" />}>חזרה למסך היום</Button>
    </div>
  );
}