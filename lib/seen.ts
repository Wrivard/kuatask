"use client";

/**
 * Set once the app has actually loaded for a signed-in member.
 *
 * The login screen has no way to tell a first visit from a returning one whose
 * session lapsed — the middleware only knows about a cookie that is still
 * present but invalid, and a cookie the browser has already discarded leaves no
 * trace at all. So the two situations look identical, which is how "I am
 * looking at the app and nothing has changed" happens when what you are looking
 * at is the login page.
 *
 * A key in localStorage, not a cookie: it says "this browser has used the app",
 * which is a fact about the browser, and it must not travel with a request.
 */
const SEEN_KEY = "kua-seen";

export function markAppSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* blocked storage — the login screen is simply quieter */
  }
}

export function hasSeenApp(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
