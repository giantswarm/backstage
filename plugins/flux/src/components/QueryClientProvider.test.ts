import { LEGACY_SHARED_PERSISTER_KEY } from '@giantswarm/backstage-plugin-kubernetes-react';
import { FLUX_PERSISTER_KEY } from './QueryClientProvider';

describe('FLUX_PERSISTER_KEY', () => {
  it("is this plugin's own localStorage key, not the shared library default", () => {
    // Sharing the default key with the gs and agent-platform providers merged
    // the three caches into one blob that grew towards the origin's quota.
    expect(FLUX_PERSISTER_KEY).toBe('flux-react-query-cache');
    expect(FLUX_PERSISTER_KEY).not.toBe(LEGACY_SHARED_PERSISTER_KEY);
  });
});
