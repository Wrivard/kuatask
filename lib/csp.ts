/**
 * Content Security Policy, with a per-request nonce.
 *
 * This was deferred when the other security headers landed, on the grounds that
 * a correct policy needs nonce plumbing and half a policy is worse than none.
 * That is still true; this is the other half.
 *
 * What it is actually defending. React escapes everything it renders, and the
 * only `dangerouslySetInnerHTML` in the app is the theme boot script, so there
 * is no known injection point today. The value is in the ones nobody has
 * thought of yet: a dependency that starts calling out to a host it did not
 * before, a future component that renders a task's notes as HTML, a paste from
 * somewhere that ends up in an `href`. A policy is the difference between that
 * being a bug and being an exfiltration.
 *
 * Two deliberate holes:
 *
 *   - `style-src-attr 'unsafe-inline'`. Every animation writes to the `style`
 *     attribute, and so does every identity dot, so refusing them means the app
 *     renders without colour or motion. This is the narrow directive — inline
 *     `style=""` only — not `style-src 'unsafe-inline'`, so an injected
 *     `<style>` block is still refused.
 *   - `'unsafe-eval'` in development only. Turbopack's HMR needs it; production
 *     does not, and does not get it.
 *
 * `strict-dynamic` is left out on purpose. It would let anything a nonced
 * script loads run unnonced, which is most of the value given away to save
 * listing one origin.
 */

/** A fresh nonce per request. Reusing one across responses defeats the point. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, supabaseUrl: string | undefined): string {
  const isDev = process.env.NODE_ENV !== "production";

  /*
    Supabase is reached over https for PostgREST and auth, and over wss for the
    realtime socket. Derived from the configured URL rather than hardcoded, so a
    project moved to another host does not silently lose realtime with no error
    anyone would connect to this file.
  */
  const supabase: string[] = [];
  if (supabaseUrl) {
    try {
      const { origin, host } = new URL(supabaseUrl);
      supabase.push(origin, `wss://${host}`);
    } catch {
      /* a malformed URL is already a louder problem than this one */
    }
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-eval'"] : [])],
    // next/font emits a <style> block; the nonce covers it
    "style-src": ["'self'", `'nonce-${nonce}'`],
    // the narrow one: style="" attributes, which motion and the accent dots need
    "style-src-attr": ["'unsafe-inline'"],
    /*
      `https:` rather than `'self'`, because an avatar is a URL somebody pastes
      and it lives wherever their photo already is.

      This was shipped broken: the avatar field went in while this line still
      said `'self'`, so every external image was refused, `onError` caught it,
      and the app fell back to initials without a word. Somebody would paste a
      URL, watch nothing happen, and have nothing to go on.

      What it costs: loading an image tells that host the viewer's IP and that
      they opened this app. For two people choosing their own avatars that is
      their call to make, and it is the reason the field says where the image
      comes from rather than pretending it is uploaded. What it does not cost is
      execution — an image cannot run anything, which is why `script-src` is
      still the narrow one and stays that way.
    */
    "img-src": ["'self'", "https:", "data:", "blob:"],
    "font-src": ["'self'"],
    /*
      'self' covers a same-origin websocket in current browsers, but not in
      every one, and dev's HMR socket failing is the kind of thing that gets
      diagnosed as "Turbopack is broken" for an hour. Named explicitly, and
      only in development.
    */
    "connect-src": [
      "'self'",
      ...supabase,
      ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  if (!isDev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}
