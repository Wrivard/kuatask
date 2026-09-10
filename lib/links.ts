/**
 * URLs found in a task's notes.
 *
 * The notes field is a textarea, and a textarea cannot hold a link — so a
 * staging URL, a Figma file or a ticket pasted in there was text you had to
 * select and copy by hand every time. Which, in an agency, is most of what ends
 * up in notes.
 *
 * `docs/06-views.md` rules out markdown, and this is not markdown: nothing is
 * parsed, nothing is rendered differently, and the text is untouched. The links
 * are simply also listed underneath, where they can be clicked.
 *
 * Only http and https. A `javascript:` or `data:` URL in an href is a way to
 * run something when a colleague clicks it, and the other person's notes are
 * not a place this app should be executing anything from.
 */
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** Trailing punctuation that is almost always sentence, not URL. */
const TRAILING = /[.,;:!?]+$/;

export type Link = { href: string; label: string };

export function extractLinks(notes: string | null): Link[] {
  if (!notes) return [];

  const seen = new Set<string>();
  const out: Link[] = [];

  for (const match of notes.match(URL_PATTERN) ?? []) {
    const href = match.replace(TRAILING, '');
    if (seen.has(href)) continue;

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    // belt and braces: the pattern already requires http(s), this refuses
    // anything a redirect through URL parsing might have turned it into
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

    seen.add(href);

    /*
      The host, plus the last path segment when there is one. A bare host says
      too little to tell two links apart, and the whole URL is usually a line of
      unreadable identifiers — "figma.com/xY7f" is the part a person recognises.
    */
    const segments = parsed.pathname.split('/').filter(Boolean);
    const tail = segments[segments.length - 1];
    const host = parsed.host.replace(/^www\./, '');
    out.push({ href, label: tail ? `${host}/${trim(tail)}` : host });
  }

  return out;
}

/** Long identifiers get cut; a label is a handle, not the thing itself. */
function trim(segment: string): string {
  return segment.length > 24 ? `${segment.slice(0, 24)}…` : segment;
}
