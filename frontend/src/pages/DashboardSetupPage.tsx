import type { ReactNode } from "react";
import { useAuth } from "../auth/auth.ts";
import { canManageDashboard } from "../dashboard/access.ts";
import CalendarsCard from "../dashboard/setup/CalendarsCard.tsx";
import SheetSourceCard from "../dashboard/setup/SheetSourceCard.tsx";
import { useSources } from "../dashboard/setup/useSources.ts";
import { LineSkeleton } from "../components/Skeleton.tsx";

// A group of cards under a small, quiet label, so the page reads as a few sections instead of
// one long stack of cards.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-7 first:mt-0">
      <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-ink/70 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

// The cards share one loaded list. This is its own component so the request only goes out for
// people allowed to see it.
function SetupCards() {
  const { state, reload } = useSources();
  if (state.status === "loading") {
    return <LineSkeleton label="Loading" />;
  }
  if (state.status === "error") return <p role="alert">{state.message}</p>;

  const { sources, serviceAccountEmail } = state.data;
  const dues = sources.find((s) => s.kind === "dues");
  const requirements = sources.find((s) => s.kind === "requirements");
  return (
    <>
      <Section title="Google access">
        <div className="card mb-4 text-sm text-ink">
          {serviceAccountEmail ? (
            <>
              <p className="font-semibold">
                Share each sheet and calendar with:
              </p>
              <p className="mt-1 break-all select-all">{serviceAccountEmail}</p>
              <p className="mt-1 text-ink/60">
                Sheets: Viewer. Calendars: See all event details.
              </p>
            </>
          ) : (
            <p role="alert">Google isn’t set up on the server yet.</p>
          )}
        </div>
      </Section>

      <Section title="Sheets">
        {/* The key makes a card start fresh (empty box, new threshold) when its source changes. */}
        <SheetSourceCard
          key={`dues-${dues?.id ?? "none"}`}
          kind="dues"
          source={dues}
          onChanged={reload}
        />
        <SheetSourceCard
          key={`req-${requirements?.id ?? "none"}`}
          kind="requirements"
          source={requirements}
          onChanged={reload}
        />
      </Section>

      <Section title="Calendars">
        <CalendarsCard
          calendars={sources.filter((s) => s.kind === "calendar")}
          onChanged={reload}
        />
      </Section>
    </>
  );
}

// /admin/dashboard: choose the sheets and calendars the dashboard reads. Officers and admins.
export default function DashboardSetupPage() {
  const auth = useAuth();
  const me = auth.status === "signedIn" ? auth.me : null;
  return (
    <main className="mx-auto max-w-2xl pt-3">
      <h1 className="mb-4 flex min-h-11 items-center pl-14 text-[32px] leading-tight font-extrabold text-ink">
        Dashboard setup
      </h1>
      {me && canManageDashboard(me.roles) ? (
        <SetupCards />
      ) : (
        <p>You don't have access to this page.</p>
      )}
    </main>
  );
}
