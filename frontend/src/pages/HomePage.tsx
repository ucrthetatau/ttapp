import { useAuth } from "../auth/auth.ts";
import EventsCard from "../dashboard/EventsCard.tsx";
import PostsCard from "../dashboard/PostsCard.tsx";
import StandingCard from "../dashboard/StandingCard.tsx";

// The first name to greet: the part of their name before the first space, or their email
// before the @ if Google never sent a name.
function firstName(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  return source.split(/\s+/)[0];
}

// The dashboard: what a member needs at a glance. Each card loads on its own and shows its
// own error, so one failing (Google being down, say) never blanks the page.
export default function HomePage() {
  const auth = useAuth();
  const name =
    auth.status === "signedIn" ? firstName(auth.me.name, auth.me.email) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 pt-5">
      <h1 className="text-[28px] font-bold text-ink">
        {name ? `Hi, ${name}` : "Theta Tau Hub"}
      </h1>
      <StandingCard />
      <EventsCard />
      <PostsCard />
    </main>
  );
}
