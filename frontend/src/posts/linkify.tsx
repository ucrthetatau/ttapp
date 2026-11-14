import type { ReactNode } from "react";

// Anything that starts with http://, https:// or www. and runs to the next space.
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/gi;

const count = (text: string, char: string) => text.split(char).length - 1;

// People write "see https://example.com." or "(https://example.com)". The full stop or the
// closing bracket belongs to the sentence, not the address, so it is peeled off the end.
// A ")" stays when the address itself opens one, like a Wikipedia page.
function trimTrailing(raw: string): string {
  let url = raw;
  while (url.length > 0) {
    const last = url[url.length - 1];
    const sentencePunctuation = ".,!?;:'\"]}".includes(last);
    const strayBracket = last === ")" && count(url, ")") > count(url, "(");
    if (!sentencePunctuation && !strayBracket) break;
    url = url.slice(0, -1);
  }
  return url;
}

// The address to open, or null when it isn't a real web address. Only http and https are
// ever turned into links, so text like "javascript:..." can't become a clickable link.
function toHref(url: string): string | null {
  const href = /^www\./i.test(url) ? `https://${url}` : url;
  try {
    const parsed = new URL(href);
    const web = parsed.protocol === "http:" || parsed.protocol === "https:";
    return web && parsed.hostname.includes(".") ? href : null;
  } catch {
    return null;
  }
}

// Turns the web addresses in a post into links and leaves everything else as plain text.
// The pieces are React elements, never HTML strings, so a post can't inject markup: React
// escapes the text itself. Links open in a new tab, and noopener keeps that page from
// reaching back into this one.
export function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let index = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailing(match[0]);
    const href = toHref(url);
    if (!href) continue;
    if (match.index > index) parts.push(text.slice(index, match.index));
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-gold-400 underline underline-offset-2 hover:text-gold-300"
      >
        {url}
      </a>,
    );
    index = match.index + url.length;
  }
  if (index < text.length) parts.push(text.slice(index));
  return parts;
}
