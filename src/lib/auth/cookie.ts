/**
 * Cookie name prefix for the session ("tamm.session_token"). Browsers share cookies across ports on
 * the same host, so a distinct prefix keeps this app's login apart from other apps on localhost
 * (e.g. the original PMS on :3001). Used by the auth config and the proxy's optimistic check.
 */
export const AUTH_COOKIE_PREFIX = "tamm";
