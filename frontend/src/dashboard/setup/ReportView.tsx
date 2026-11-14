import type { SourceCheckReport } from "@ttapp/shared";

// What the save check found, shown right after a save and gone when the officer leaves the
// page (the backend does not store it). The counts and the preview are information: a test
// email that is not a member is normal and never blocks a save.
export default function ReportView({ report }: { report: SourceCheckReport }) {
  return (
    <div
      role="status"
      className="mt-3 space-y-2 rounded-xl bg-gold-tint p-3 text-sm text-ink"
    >
      <p className="font-semibold">Saved. Reading “{report.name}”.</p>
      {report.rows !== null && (
        <p>
          {report.matched} of {report.rows} rows match a member (by{" "}
          {report.matchBy}).
          {report.membersWithoutRow
            ? ` ${report.membersWithoutRow} members have no row.`
            : ""}
        </p>
      )}
      {!!report.membersWithoutName && (
        <p>
          {report.membersWithoutName} members haven’t signed in yet, so the app
          has no name for them.
        </p>
      )}
      {!!report.ambiguousMembers && (
        <p className="text-red-300">
          {report.ambiguousMembers} members share a name with someone else, so
          they will see nothing until a name is changed.
        </p>
      )}
      {report.looseMatches.length > 0 && (
        <details>
          <summary className="cursor-pointer">
            {report.looseMatches.length} matched by first and last name only
          </summary>
          <p className="mt-1 text-xs text-ink/70">
            The middle name differs. Check these are the same people.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {report.looseMatches.map((pair) => (
              <li key={`${pair.sheet}|${pair.member}`}>
                Sheet: {pair.sheet} · Account: {pair.member}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.unmatched.length > 0 && (
        <details>
          <summary className="cursor-pointer">
            {report.unmatched.length} rows aren’t members
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {report.unmatched.map((entry) => (
              <li key={entry} className="break-all">
                {entry}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.warnings.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-red-300">
            {report.warnings.length} cells can’t be read
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {report.preview.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="pr-3 pb-1">MEMBER</th>
                {report.previewHeaders.map((header) => (
                  <th key={header} className="pr-3 pb-1">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.preview.map((row) => (
                <tr key={row.email}>
                  <td className="pr-3">{row.email}</td>
                  {row.cells.map((cell, index) => (
                    <td key={index} className="pr-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
