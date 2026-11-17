// "Abstaining: − 0 +": how many of the people in the room are sitting this vote out (stepped
// out, not following). It is only a number, nobody is named. The vote is measured against the
// people present minus this number. `max` is one below the number present, because at least one
// member has to be counted.
export default function AbstainStepper({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const round =
    "flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink text-2xl leading-none font-bold text-ink transition-colors hover:bg-gold-tint disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 text-sm font-semibold text-ink">Abstaining</p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={disabled || value <= 0}
          aria-label="One fewer abstaining"
          className={round}
        >
          −
        </button>
        <span
          aria-live="polite"
          className="w-9 text-center text-2xl font-extrabold text-gold-400 tabular-nums"
        >
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={disabled || value >= max}
          aria-label="One more abstaining"
          className={round}
        >
          +
        </button>
      </div>
    </div>
  );
}
