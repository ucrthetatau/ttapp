// A small ring that turns while something saves. It takes the text color of the button it sits
// in, and is hidden from screen readers (the button's own words change, for example "Saving...").
export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[1em] w-[1em] animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none ${className}`}
    />
  );
}
