import { useAuth } from "../auth/auth.ts";
import EventsCard from "../dashboard/EventsCard.tsx";
import PostsCard from "../dashboard/PostsCard.tsx";
import StandingCard from "../dashboard/StandingCard.tsx";
import { useNow } from "../dashboard/useNow.ts";

// The first name to greet: the part of their name before the first space, or their email
// before the @ if Google never sent a name.
function firstName(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  return source.split(/\s+/)[0];
}

// Morning until noon, afternoon until 6, evening after. Uses the phone's own clock.
function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The dashboard: what a member needs at a glance. Each card loads on its own and shows its
// own error, so one failing (Google being down, say) never blanks the page.
export default function HomePage() {
  const auth = useAuth();
  const now = useNow();
  const name =
    auth.status === "signedIn" ? firstName(auth.me.name, auth.me.email) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 pt-3">
      {/* Quiet on purpose: a small date, then a medium greeting with only the name in bold,
          so it welcomes without competing with the numbers below. */}
      <header className="flex min-h-11 flex-col justify-center pl-14">
        <p className="text-xs font-bold tracking-widest text-ink/50 uppercase">
          {now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </p>
        <h1 className="mt-0.5 text-2xl font-medium text-ink/80">
          {name ? (
            <>
              {greetingFor(now)},{" "}
              <span className="font-bold text-ink">{name}</span>
            </>
          ) : (
            "Theta Tau Hub"
          )}
        </h1>
      </header>
      <StandingCard />
      <EventsCard />
      <PostsCard />
    </main>
  );
}
