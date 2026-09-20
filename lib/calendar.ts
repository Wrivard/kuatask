/**
 * What a month cell is made of.
 *
 * Numbers rather than a component, and in `lib/` rather than beside the cell,
 * because how many tasks a day shows is a promise to the people using this —
 * "at least five, then « +2 »" — and a promise is worth a test. It was got
 * wrong twice from the other direction: once by capping the count at a constant
 * that ignored the window, and once by sizing the grid's rows in a way that
 * never reached the cells at all. Both times the app looked fine and showed one
 * task a day.
 */

/**
 * The shortest a month cell may be.
 *
 * Six cards at `CARD_PITCH` plus `CELL_CHROME`. The consequence is that six
 * rows no longer fit a viewport and the month scrolls, which is the trade: a
 * grid you scroll and can read beats one that fits and cannot.
 *
 * It belongs to the *cell*, not to the grid's rows. Setting
 * `grid-auto-rows: minmax(…, 1fr)` compiled, applied, and changed nothing — a
 * row sizes to its tallest item, so giving the item the minimum is the shorter
 * causal chain and does not depend on how `fr` resolves in an auto-height grid.
 */
export const CELL_MIN_HEIGHT = 176;

/** The date chip above the cards, the cell's padding, and room for a « +N ». */
export const CELL_CHROME = 44;

/**
 * A guess at the card's pitch, used for exactly one frame.
 *
 * `useRowsThatFit` reads the real distance between two rendered cards, so this
 * only has to be close enough for the first paint, before any card exists to
 * measure. An earlier version called the same number "measured" and divided by
 * it for ever; it was an estimate, and it would have drifted silently the moment
 * the card's padding changed.
 */
export const CARD_PITCH = 22;

/**
 * How many cards a cell of the minimum height can show.
 *
 * The same arithmetic `useRowsThatFit` does against the measured height, run
 * against the floor — so a test can hold it to the promise without a browser.
 */
export function cardsPerCell(
  height: number = CELL_MIN_HEIGHT,
  pitch: number = CARD_PITCH,
): number {
  return Math.max(1, Math.floor((height - CELL_CHROME) / pitch));
}
