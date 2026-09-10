/**
 * What the browser downloads, per chunk and in total.
 *
 *   npm run build && npm run size
 *
 * Not a bundle analyzer. The stack is locked, and `@next/bundle-analyzer` is a
 * dependency plus a webpack plugin on a Turbopack build, to answer a question
 * that reading `.next` already answers: what is big, and did it get bigger.
 *
 * Together with `npm run bench` — which measures the CPU side — this is the
 * regression surface. Both print numbers rather than opinions, which is the
 * point: the dialogs were split out of the first load on a measurement, and the
 * same measurement showed total bytes going *up* while first load went down.
 * Neither of those was guessable.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = ".next/static/chunks";

if (!fs.existsSync(DIR)) {
  console.error("no build found — run `npm run build` first");
  process.exit(2);
}

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
};
walk(DIR);

const sized = files
  .map((file) => {
    const bytes = fs.readFileSync(file);
    return {
      name: path.relative(DIR, file),
      raw: bytes.length,
      gzip: zlib.gzipSync(bytes, { level: 9 }).length,
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const total = sized.reduce(
  (acc, f) => ({ raw: acc.raw + f.raw, gzip: acc.gzip + f.gzip }),
  { raw: 0, gzip: 0 },
);

console.log(`\n${sized.length} chunks — ${kb(total.raw)} raw, ${kb(total.gzip)} gzipped\n`);
console.log("largest, gzipped:");
for (const f of sized.slice(0, 12)) {
  console.log(`  ${kb(f.gzip).padStart(9)}  ${kb(f.raw).padStart(9)} raw  ${f.name}`);
}

/*
  Which library is where.

  A dependency landing in the shared bundle instead of the one chunk that uses
  it is the regression worth catching, and it does not show up in a total — the
  total barely moves while every page starts paying for it. `cmdk` in a single
  chunk is the command palette staying off the first load; `cmdk` in four is
  that having quietly come undone.

  The probe is a string that survives minification, not the package name — an
  import specifier is long gone by the time this reads the output.
*/
const LIBRARIES = [
  { name: "cmdk", marker: "cmdk" },
  { name: "motion", marker: "projection" },
  { name: "date-fns", marker: "date-fns" },
  { name: "supabase", marker: "@supabase" },
  { name: "sonner", marker: "sonner" },
  { name: "lucide", marker: "lucide" },
];

console.log("\nwhere the libraries live:");
for (const { name, marker } of LIBRARIES) {
  const carriers = sized.filter((f) =>
    fs.readFileSync(path.join(DIR, f.name), "utf8").includes(marker),
  );
  const where =
    carriers.length === 0
      ? "marker missed — fix the probe rather than assuming it is gone"
      : carriers.length > 3
        ? `${carriers.length} chunks — check this`
        : carriers.map((c) => `${c.name} (${kb(c.gzip)})`).join(", ");
  console.log(`  ${name.padEnd(10)} ${where}`);
}

console.log("\nfirst-load figures per route come from `npm run build` itself.\n");
