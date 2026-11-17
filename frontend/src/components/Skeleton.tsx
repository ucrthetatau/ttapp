// Grey-gold placeholder shapes shown while data loads. They are laid out like the real content
// (a card, a row, a tile), so the page does not jump when the data arrives. The pulse is in
// index.css (.skeleton) and switches itself off when the phone asks for reduced motion.
//
// Every placeholder is hidden from screen readers; the region that holds it says "busy" instead.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

// A card with a title line, two text lines and two pill buttons: the shape of a vote.
export function VoteCardSkeleton() {
  return (
    <div className="card space-y-3" role="status" aria-label="Loading votes">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-12 flex-1 rounded-full" />
        <Skeleton className="h-12 flex-1 rounded-full" />
      </div>
    </div>
  );
}

// An announcement: round avatar, name line, title line, two lines of text.
export function PostSkeleton() {
  return (
    <div className="card flex gap-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// A list of `count` rows inside a busy region: members, links.
export function RowsSkeleton({
  count = 4,
  label,
}: {
  count?: number;
  label: string;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card flex items-center gap-3 py-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-5 flex-1" />
        </div>
      ))}
    </div>
  );
}

// A short line, for the small "Loading..." spots inside a card or pop-up.
export function LineSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
