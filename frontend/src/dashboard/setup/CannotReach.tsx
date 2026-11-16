// The collapsed "Can't be reached" list in a reminder pop-up: the people an officer has to
// text (or fix the sheet for), grouped by why. Shared by the dues and requirements pop-ups; the
// wording that differs between them comes in as props.
export default function CannotReach({
  noDevice,
  noDeviceText,
  noRow,
  noRowText,
  unclear,
  unreadable,
  unreadableText,
  noName,
}: {
  /** Already formatted, e.g. "Hal Irwin ($30)". */
  noDevice: string[];
  noDeviceText: string;
  noRow: string[];
  noRowText: string;
  unclear: string[];
  unreadable: string[];
  unreadableText: string;
  noName: number;
}) {
  const total =
    noDevice.length + noRow.length + unclear.length + unreadable.length;
  if (total === 0 && noName === 0) return null;
  return (
    <details className="mt-3 text-sm text-ink/80">
      <summary className="cursor-pointer font-semibold text-ink">
        Can’t be reached ({total})
      </summary>
      <div className="mt-2 space-y-2">
        {noDevice.length > 0 && (
          <div>
            <p className="text-ink/60">{noDeviceText}</p>
            <p>{noDevice.join(", ")}</p>
          </div>
        )}
        {noRow.length > 0 && (
          <div>
            <p className="text-ink/60">{noRowText}</p>
            <p>{noRow.join(", ")}</p>
          </div>
        )}
        {unclear.length > 0 && (
          <div>
            <p className="text-ink/60">Same name twice, so not matched:</p>
            <p>{unclear.join(", ")}</p>
          </div>
        )}
        {unreadable.length > 0 && (
          <div>
            <p className="text-ink/60">{unreadableText}</p>
            <p>{unreadable.join(", ")}</p>
          </div>
        )}
        {noName > 0 && (
          <p className="text-ink/60">
            {noName} not signed in yet, so no name to match.
          </p>
        )}
      </div>
    </details>
  );
}
