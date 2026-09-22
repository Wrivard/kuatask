import { copy } from '@/lib/copy';

/**
 * Every place the app can go, as data.
 *
 * Separated from the icons so it can be loaded without React, which is what
 * lets `verify:logic` hold it to its own rules — chiefly that no two routes
 * claim the same `g` key. A collision there costs one route its keyboard path
 * and shows nothing: the sequence simply lands on whichever entry `Object`
 * enumerated last.
 *
 * The rail, the command palette and the shortcut sheet all read this. They did
 * not, and every route added after the first four was wired into the rail and
 * forgotten in the other two — `/activity`, `/stats` and `/notes` were each
 * missing from the palette, and two of the three had no shortcut at all.
 */
export type Route = {
  href: string;
  label: string;
  /** The key that follows `g`, and the letter the shortcut sheet prints. */
  key: string;
  /** What the palette matches typing against; the label alone is too narrow. */
  keywords: string;
};

export const ROUTES: Route[] = [
  {
    href: '/notes',
    label: copy.nav.notes,
    // d for dump: b is the board, and braindump offers nothing else free
    key: 'd',
    keywords: 'braindump vrac notes idees dump',
  },
  { href: '/', label: copy.nav.list, key: 'l', keywords: 'liste aujourdhui taches' },
  {
    href: '/board',
    label: copy.nav.board,
    key: 'b',
    keywords: 'tableau board kanban colonnes',
  },
  {
    href: '/calendar',
    label: copy.nav.calendar,
    key: 'c',
    keywords: 'calendrier mois semaine',
  },
  {
    href: '/activity',
    label: copy.nav.activity,
    key: 'a',
    keywords: 'activite historique journal restaurer',
  },
  {
    href: '/billing',
    label: copy.nav.billing,
    key: 'f',
    keywords: 'facturation factures clients temps heures argent paiement',
  },
  {
    href: '/stats',
    label: copy.nav.stats,
    // p for palmarès: c and l, the letters « Classement » offers, are taken
    key: 'p',
    keywords: 'classement palmares stats chiffres serie',
  },
];

/**
 * Keys `g` may not hand out, because something else already answers to them.
 *
 * `s` is settings, which is reachable behind `g` without being a view.
 */
export const RESERVED_SEQUENCE_KEYS = ['s'];
