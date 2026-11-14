import type { MeResponse, MemberSummary } from "@ttapp/shared";
import { useState } from "react";
import { useAuth } from "../auth/auth.ts";
import { canManageMembers, canRemoveMember } from "../members/access.ts";
import AddMemberForm from "../members/AddMemberForm.tsx";
import BulkAddMembersForm from "../members/BulkAddMembersForm.tsx";
import {
  addMember,
  eraseMember,
  grantRole,
  removeMember,
  revokeRole,
  setCanVote,
} from "../members/api.ts";
import type { GrantableRole } from "../members/api.ts";
import RoleChips from "../members/RoleChips.tsx";
import { useMembers } from "../members/useMembers.ts";
import { useMembersDoorbell } from "../members/useMembersDoorbell.ts";
import type { MembersState } from "../members/useMembers.ts";

type ActionResult = { ok: true } | { ok: false; message: string };

const smallButton =
  "rounded-full border px-3 py-1.5 text-sm font-semibold disabled:opacity-60";

function MemberList({
  state,
  viewer,
  onChanged,
}: {
  state: MembersState;
  viewer: MeResponse;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "loading") return <p>Loading members…</p>;
  if (state.status === "error") return <p role="alert">{state.message}</p>;

  const isAdmin = viewer.roles.includes("admin");
  const active = state.members.filter((member) => !member.removedAt);
  const removed = state.members.filter((member) => member.removedAt);

  // Runs one remove or restore. Success reloads the list; failure shows the server's message.
  async function run(
    member: MemberSummary,
    action: () => Promise<ActionResult>,
    changesOwnRoles = false,
  ) {
    setBusyId(member.id);
    setError(null);
    const result = await action();
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
    } else if (changesOwnRoles) {
      // The header and this page were built from the old roles, so start fresh.
      window.location.reload();
    } else {
      onChanged();
    }
  }

  function handleRemove(member: MemberSummary) {
    const label = member.name ?? member.email;
    if (!window.confirm(`Remove ${label}? They'll be signed out right away.`)) {
      return;
    }
    void run(member, () => removeMember(member.id));
  }

  function handleGrant(member: MemberSummary, role: GrantableRole) {
    const isMe = member.email === viewer.email;
    void run(member, () => grantRole(member.id, role), isMe);
  }

  function handleRevoke(member: MemberSummary, role: GrantableRole) {
    const isMe = member.email === viewer.email;
    if (role === "admin") {
      const who = isMe ? "your own" : `${member.name ?? member.email}'s`;
      const warning = isMe ? " You will lose admin access." : "";
      if (!window.confirm(`Remove ${who} admin role?${warning}`)) return;
    }
    void run(member, () => revokeRole(member.id, role), isMe);
  }

  // The switch only reloads the list; the backend decides, and refuses with a message if not.
  function handleCanVote(member: MemberSummary) {
    void run(member, () => setCanVote(member.id, !member.canVote));
  }

  // Restoring is adding the same email again. The backend brings the person back.
  function handleRestore(member: MemberSummary) {
    void run(member, () => addMember(member.email));
  }

  // Permanent. Their email and name are deleted and can't be brought back.
  function handleErase(member: MemberSummary) {
    const label = member.name ?? member.email;
    const ok = window.confirm(
      `Permanently erase ${label}? Their email and name are deleted and this can't be undone. ` +
        `Anything they posted or voted stays, under "Former member".`,
    );
    if (ok) void run(member, () => eraseMember(member.id));
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {active.length === 0 ? (
        <p className="card text-ink/70">No members yet.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((member) => (
            <li key={member.id} className="flex items-center gap-3">
              <div className="card flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 py-4">
                <div>
                  <p className="font-bold text-ink">
                    {member.name ?? member.email}
                  </p>
                  <p className="text-sm text-ink/60">
                    {member.name ? member.email : "Hasn't signed in yet"}
                  </p>
                </div>
                <RoleChips
                  roles={member.roles}
                  editable={isAdmin}
                  busy={busyId !== null}
                  onGrant={(role) => handleGrant(member, role)}
                  onRevoke={(role) => handleRevoke(member, role)}
                />
                <label className="flex w-full items-center gap-2 text-sm text-ink/80">
                  <input
                    className="accent-maroon-500"
                    type="checkbox"
                    checked={member.canVote}
                    onChange={() => handleCanVote(member)}
                    disabled={busyId !== null}
                  />
                  Can vote
                </label>
              </div>
              {/* Fixed width, so the cards line up whether or not there is a button. */}
              <div className="w-20 shrink-0">
                {canRemoveMember(viewer, member) && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member)}
                    disabled={busyId !== null}
                    className={`${smallButton} w-full border-line text-red-800 hover:bg-red-50`}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {removed.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer font-bold text-ink">
            Removed ({removed.length})
          </summary>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white shadow-soft">
            {removed.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-ink">
                    {member.erased
                      ? "Former member"
                      : (member.name ?? member.email)}
                  </p>
                  <p className="text-sm text-ink/60">
                    {member.erased
                      ? "Personal data erased · "
                      : member.name
                        ? `${member.email} · `
                        : ""}
                    Removed{" "}
                    {member.removedAt &&
                      new Date(member.removedAt).toLocaleDateString()}
                  </p>
                </div>
                {!member.erased && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestore(member)}
                      disabled={busyId !== null}
                      className={`${smallButton} border-maroon-500 text-maroon-500 hover:bg-gold-tint`}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => handleErase(member)}
                      disabled={busyId !== null}
                      className={`${smallButton} border-line text-red-800 hover:bg-red-50`}
                    >
                      Erase
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

// The form and the list share one loaded list. This is its own component so the request
// only goes out for people allowed to see it.
function MembersAdmin({ viewer }: { viewer: MeResponse }) {
  const { state, reload } = useMembers();
  // Other officers' changes show up here by themselves.
  useMembersDoorbell(reload);
  return (
    <>
      <AddMemberForm onChanged={reload} />
      <BulkAddMembersForm onChanged={reload} />
      <MemberList state={state} viewer={viewer} onChanged={reload} />
    </>
  );
}

// /admin/members: the chapter's member list. Officers and admins only.
export default function MembersPage() {
  const auth = useAuth();
  const me = auth.status === "signedIn" ? auth.me : null;

  return (
    <main className="mx-auto max-w-2xl pt-3">
      <h1 className="mb-4 flex min-h-11 items-center pl-14 text-[28px] font-bold text-ink">
        Members
      </h1>
      {me && canManageMembers(me.roles) ? (
        <MembersAdmin viewer={me} />
      ) : (
        <p>You don't have access to this page.</p>
      )}
    </main>
  );
}
