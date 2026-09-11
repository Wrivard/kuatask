/**
 * The contrast gate from `docs/10-quality-bar.md`, computed from the tokens.
 *
 *   npm run verify:contrast
 *
 * The bar: body text at least 4.5:1, large text and UI borders at least 3:1, in
 * both themes. The document names `--ink-faint` on `--bg` as the one to verify,
 * and it was right — it failed at 2.74:1 during Phase 6 and both it and
 * `--ink-muted` had to move to keep the three-step ramp intact.
 *
 * That was checked once, by hand, from a calculator. Which means the next
 * person to nudge a hex value gets no warning at all, and a contrast failure is
 * invisible to everybody who does not have the deficiency it excludes. So it is
 * a script now, and it reads the same stylesheet the browser does rather than a
 * copy of the numbers.
 *
 * Hairlines are exempt from the 3:1 bar on purpose: WCAG 1.4.11 applies to
 * parts that carry meaning or state, and a divider between two rows carries
 * neither — it is texture. `--control`, which draws the edge of a real control,
 * is held to it.
 */
import fs from "node:fs";

const css = fs.readFileSync("app/globals.css", "utf8");

/** The two theme blocks, by the selector each opens with. */
function tokensIn(startPattern) {
  const start = css.indexOf(startPattern);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open, close);

  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const themes = {
  dark: tokensIn(":root,"),
  light: tokensIn(".light {"),
};

const srgb = (h) => {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
const linear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (h) => {
  const [r, g, b] = srgb(h).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** token, what it is for, the floor it has to clear. */
const CHECKS = [
  ["ink", "body text", 4.5],
  ["ink-muted", "secondary text", 4.5],
  ["ink-faint", "the one docs/10 names", 4.5],
  ["control", "the edge of a control", 3],
  // the palette names them by colour; --color-accent and --color-danger are
  // aliases onto these, so these are what actually has to clear the bar
  ["green", "the accent — today's numeral, focus, the ring", 3],
  ["red", "overdue dates and destructive actions", 4.5],
];

let failures = 0;

for (const [name, tokens] of Object.entries(themes)) {
  if (!tokens) {
    console.log(`  could not find the ${name} block`);
    failures += 1;
    continue;
  }

  const bg = tokens.bg;
  console.log(`\n${name} — on ${bg}\n`);

  for (const [token, what, floor] of CHECKS) {
    const value = tokens[token];
    if (!value || !value.startsWith("#")) {
      console.log(`  SKIP  --${token} is ${value ?? "missing"}, not a literal colour`);
      continue;
    }
    const ratio = contrast(value, bg);
    const ok = ratio >= floor;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  --${token.padEnd(10)} ${value}  ` +
        `${ratio.toFixed(2)}:1  (needs ${floor}) — ${what}`,
    );
  }

  // the three-step ramp has to stay a ramp, or the hierarchy stops reading
  const ramp = ["ink", "ink-muted", "ink-faint"]
    .map((t) => tokens[t])
    .filter((v) => v?.startsWith("#"))
    .map((v) => contrast(v, bg));

  const descending = ramp.every((v, i) => i === 0 || v < ramp[i - 1]);
  if (!descending) failures += 1;
  console.log(
    `  ${descending ? "PASS" : "FAIL"}  the ramp still descends: ` +
      ramp.map((r) => `${r.toFixed(1)}`).join(" > "),
  );
}

console.log(`\n${failures === 0 ? "the contrast bar holds" : `${failures} FAILED`}\n`);
process.exit(failures ? 1 : 0);
