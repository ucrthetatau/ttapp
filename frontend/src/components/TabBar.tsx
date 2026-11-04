import type { ComponentType } from "react";
import { NavLink } from "react-router";
import { HomeIcon, LinkIcon, PostsIcon, VotesIcon } from "./icons.tsx";

type Tab = {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  end?: boolean; // only highlight on this exact address (Home is "/", which every address starts with)
};

// The tabs along the bottom, for every signed-in member. Add one here when a screen lands
// (Links, Posts, Votes, then the dashboard). A tab for a screen that doesn't exist yet would lead nowhere.
const tabs: Tab[] = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/posts", label: "Posts", Icon: PostsIcon },
  { to: "/votes", label: "Votes", Icon: VotesIcon },
  { to: "/links", label: "Links", Icon: LinkIcon },
];

// Fixed to the bottom of the screen like a phone app. Icon on top, small label below.
export default function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] font-medium ${
                  isActive
                    ? "border-gold-400 text-maroon-500"
                    : "border-transparent text-ink/60"
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
