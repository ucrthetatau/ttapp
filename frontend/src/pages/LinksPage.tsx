import type { DriveLink } from "@ttapp/shared";
import { useState } from "react";
import { useAuth } from "../auth/auth.ts";
import { canManageLinks } from "../links/access.ts";
import AddLinkForm from "../links/AddLinkForm.tsx";
import { removeLink } from "../links/api.ts";
import { accountChooserUrl, isGoogleLink } from "../links/googleAccount.ts";
import { useLinks } from "../links/useLinks.ts";
import { useLinksDoorbell } from "../links/useLinksDoorbell.ts";

// /links: the chapter's shared links. Everyone can open them; officers and admins can add
// and remove. Whether someone can OPEN a file is decided by Google Drive's sharing settings,
// not by this app.
export default function LinksPage() {
  const auth = useAuth();
  const canManage = auth.status === "signedIn" && canManageLinks(auth.me.roles);
  const { state, reload } = useLinks();
  // Links added or removed by an officer show up here by themselves.
  useLinksDoorbell(reload);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(link: DriveLink) {
    const ok = window.confirm(
      `Remove "${link.label}"? This only removes the link here. It doesn't change who can open the file in Google Drive.`,
    );
    if (!ok) return;
    setBusyId(link.id);
    setError(null);
    const result = await removeLink(link.id);
    setBusyId(null);
    if (result.ok) reload();
    else setError(result.message);
  }

  return (
    <main className="mx-auto max-w-2xl pt-3">
      <h1 className="mb-1 flex min-h-11 items-center pl-14 text-[32px] leading-tight font-extrabold text-ink">
        Links
      </h1>
      <p className="mb-4 text-sm text-ink/60">
        Can't open one? Try "Another account" next to a Google link.
      </p>

      {canManage && <AddLinkForm onChanged={reload} />}

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {state.status === "loading" && <p>Loading links…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "loaded" && state.links.length === 0 && (
        <p className="card text-ink/70">No links yet.</p>
      )}
      {state.status === "loaded" && state.links.length > 0 && (
        <ul className="space-y-2">
          {state.links.map((link) => (
            <li key={link.id} className="flex items-center gap-3">
              <div className="card flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 py-4">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 font-bold text-gold-400 underline-offset-2 hover:underline"
                >
                  {link.label}
                </a>
                {isGoogleLink(link.url) && (
                  <a
                    href={accountChooserUrl(link.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink/60 underline-offset-2 hover:underline"
                  >
                    Another account
                  </a>
                )}
              </div>
              {/* Fixed width so the cards line up whether or not there is a button. */}
              {canManage && (
                <div className="w-20 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleRemove(link)}
                    disabled={busyId !== null}
                    className="w-full rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
