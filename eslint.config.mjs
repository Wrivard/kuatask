import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      /*
        reference/ holds the specification's own implementations. They were
        copied into lib/ and adapted there, and tsconfig already excludes them
        for the same reason: they are a historical artifact, not app code, and
        linting them only reports on decisions somebody else made.
      */
      "reference/**",
      // scratch directory created and removed by scripts/verify-logic.mjs
      ".verify-tmp-*/**",
    ],
  },
];

export default eslintConfig;
