/**
 * What a search query means.
 *
 * Search was a substring test over `title + "#" + label + notes` joined into one
 * string, which makes `#facture` and `facture` the same question and neither of
 * them "tasks tagged facture". Clicking a label chip fills the box with
 * `#facture` and reads as « show me this tag » — and returned every task that
 * happened to mention the word in its notes alongside the ones actually
 * carrying the label. With a handful of tasks that looks like it works. With a
 * client's name used in both places it stops being a filter at all.
 *
 * So a `#token` is a tag filter and everything else is free text, and the two
 * combine: `#facture client` means tagged facture *and* mentioning client.
 *
 * Tags match by prefix rather than equality, because the query is being typed.
 * `#fac` should find `#facture` on the way to it — the results narrowing as you
 * type is the feedback that tells you the tag exists at all.
 */

/** Lowercase and strip accents, so "etiquette" finds "étiquette". */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export type Query = {
  /** The tag to filter by, without its `#`, normalized. Null when none was typed. */
  tag: string | null;
  /** Everything that was not the tag, normalized. Empty when nothing is left. */
  text: string;
};

/**
 * Splits a raw query into its tag and its words.
 *
 * Only the first `#token` counts. Two tags would have to mean either "both" or
 * "either", and a task carries exactly one label — so "both" can never match and
 * "either" is a feature nobody asked for. The rest is treated as text, which is
 * also what makes a bare `#` harmless: it names no tag and filters nothing.
 */
export function parseQuery(raw: string): Query {
  let tag: string | null = null;

  const words = raw.trim().split(/\s+/).filter(Boolean);
  const rest: string[] = [];

  for (const word of words) {
    if (tag === null && word.startsWith("#") && word.length > 1) {
      tag = normalize(word.slice(1));
      continue;
    }
    rest.push(word);
  }

  return { tag, text: normalize(rest.join(" ")) };
}

/** The fields a search looks at. */
export type Searchable = {
  title: string;
  label: string | null;
  notes: string | null;
};

/**
 * Whether one task answers the query.
 *
 * A tag and text are ANDed. Text still searches the label as well as the title
 * and notes, so typing a client's name without the `#` finds their tasks — the
 * `#` narrows, it does not unlock.
 */
export function matches(task: Searchable, query: Query): boolean {
  if (query.tag !== null) {
    if (!task.label) return false;
    if (!normalize(task.label).startsWith(query.tag)) return false;
  }

  if (query.text === "") return query.tag !== null;

  const haystack = normalize(
    [task.title, task.label ?? "", task.notes ?? ""].join(" "),
  );
  return haystack.includes(query.text);
}

/**
 * The term to send to the database for the archive lookup.
 *
 * `searchArchive` reaches past the loaded window, and it has to ask the same
 * question this file answers locally or the two disagree about what a tag is —
 * which is the bug where a tagged task from last month is found only if the word
 * also appears in its title.
 */
export function archiveTerm(query: Query): { tag: string | null; text: string } {
  return { tag: query.tag, text: query.text };
}
