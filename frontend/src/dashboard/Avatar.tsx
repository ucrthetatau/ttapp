import { useState } from "react";

// First letter of the first and last word of a name: "Dana Lee" -> "DL", "Cher" -> "C". For an
// email (a member with no name) it uses the part before the @.
function initialsOf(name: string): string {
  const words = name.split("@")[0].trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// A round avatar: the member's picture if one is given and loads, otherwise their initials on
// maroon. The picture is optional on purpose, so nobody is ever left with a blank circle.
export default function Avatar({
  name,
  picture,
  size = 40,
}: {
  name: string;
  picture?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };

  if (picture && !broken) {
    return (
      <img
        src={picture}
        alt=""
        style={style}
        // Google's picture host can refuse requests that carry another site as the referrer.
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-maroon-500 text-sm font-bold text-gold-300"
    >
      {initialsOf(name)}
    </span>
  );
}
