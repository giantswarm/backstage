import { liveRouterState } from './liveRouterState';

describe('liveRouterState', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it("reads the history entry's router state", () => {
    window.history.replaceState({ usr: { live: true }, key: 'a' }, '', '/');

    expect(liveRouterState({ rendered: true })).toEqual({ live: true });
  });

  it('reads a cleared entry as cleared, not as the rendered state', () => {
    window.history.replaceState({ usr: null, key: 'b' }, '', '/');

    expect(liveRouterState({ rendered: true })).toBeNull();
  });

  it('falls back to the rendered state without a router entry', () => {
    window.history.replaceState(null, '', '/');

    expect(liveRouterState({ rendered: true })).toEqual({ rendered: true });
  });
});
