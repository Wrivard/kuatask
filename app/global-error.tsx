"use client";

import * as React from "react";
import { report } from "@/lib/report";

/**
 * The last boundary. Catches a crash in the root layout itself, which
 * `(app)/error.tsx` cannot — it lives inside the tree that just failed.
 *
 * It has to render its own `<html>` and `<body>`, so nothing here can lean on
 * the app's fonts, tokens or copy module: whatever broke may be exactly what
 * would be needed to load them. Plain markup and inline colours, deliberately.
 * This screen should be reachable when nothing else is.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[kua] root crashed", error);
    report(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#0b0b0c",
          color: "#ededed",
          font: "15px/1.5 ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Quelque chose a cassé
          </h1>
          <p style={{ marginTop: 12, fontSize: 13, color: "#a0a0a4" }}>
            Rien n&apos;est perdu — tes tâches sont enregistrées. Recharge la page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              height: 40,
              padding: "0 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#ededed",
              background: "transparent",
              border: "1px solid #2e2e32",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: "#6b6b70", fontFamily: "ui-monospace, monospace" }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
