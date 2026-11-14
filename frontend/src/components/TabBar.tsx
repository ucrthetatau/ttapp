import type { ComponentType } from "react";
import { NavLink } from "react-router";
import { VOTING_ONLY } from "../features.ts";
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
  { to: "/", label: "Dashboard", Icon: HomeIcon, end: true },
  { to: "/posts", label: "Posts", Icon: PostsIcon },
  { to: "/votes", label: "Votes", Icon: VotesIcon },
  { to: "/links", label: "Links", Icon: LinkIcon },
];

// In voting-only mode (features.ts) just the Votes tab is shown.
const visibleTabs = VOTING_ONLY
  ? tabs.filter((tab) => tab.to === "/votes")
  : tabs;

// Fixed to the bottom of the screen like a phone app. Icon on top, small label below.
export default function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bar pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.03)]"
    >
      <ul className="mx-auto flex max-w-2xl">
        {visibleTabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `-mt-px flex flex-col items-center gap-1 border-t-2 py-2.5 text-[10px] font-semibold tracking-wide ${
                  isActive
                    ? "border-gold-400 text-gold-400"
                    : "border-transparent text-ink/50"
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
