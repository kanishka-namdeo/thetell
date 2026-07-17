/**
 * Centralized fetch wrapper for API calls that automatically includes
 * credentials (cookies) for authentication with the proxy middleware.
 *
 * Always use this instead of raw `fetch()` for API calls within the app.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}
