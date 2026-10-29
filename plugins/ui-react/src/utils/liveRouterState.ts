/**
 * The router state a replacing navigation that only rewrites the query string
 * has to carry over. `setSearchParams` drops it otherwise, and with it any
 * one-shot handoff a page reads from it on mount.
 *
 * Read from the history entry as it is now rather than from the render: an
 * effect earlier in the same commit may already have replaced the state, and
 * writing back what the render saw would bring a cleared handoff back to life.
 *
 * Assumes the app's one `BrowserRouter`, which keeps its state in
 * `window.history` under `usr`. Without such an entry (`MemoryRouter`, a fresh
 * page load) it falls back to the rendered state.
 */
export function liveRouterState(rendered: unknown): unknown {
  const entry: unknown = window.history.state;
  if (entry && typeof entry === 'object' && 'usr' in entry) {
    return entry.usr;
  }
  return rendered;
}
