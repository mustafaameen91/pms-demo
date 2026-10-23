import { refresh } from "next/cache";

/**
 * Refreshes the website page after a change. The phone app's API calls the very
 * same actions from Route Handlers, where Next.js doesn't allow refresh(); there
 * it does nothing (the app reloads what it shows itself).
 */
export function refreshPage() {
  try {
    refresh();
  } catch {
    // Not inside a Server Action (a mobile API request).
  }
}
