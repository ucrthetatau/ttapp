import type { ReactNode } from "react";

// Small line icons that take the color of the text around them. Drawn here so the app
// needs no icon library.
function Icon({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export function HomeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </Icon>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14c2.8 0 4.5 1.9 4.5 4.5" />
    </Icon>
  );
}

export function PostsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 5h16v11H10l-4 4v-4H4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </Icon>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </Icon>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

export function VotesIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </Icon>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}
