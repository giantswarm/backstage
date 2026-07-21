import { useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { Avatar } from '@backstage/ui';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';

/**
 * ~72px preview slot — larger than bui's biggest token (x-large = 48px), so the
 * dimensions are overridden inline. Request the nearest larger allowlisted size
 * for crispness on hi-dpi displays.
 */
const PREVIEW_AVATAR_PX = 72;
const PREVIEW_AVATAR_SIZE: AvatarSize = 128;

/** Debounce so throwaway seeds typed while naming don't hit the renderer. */
const DEBOUNCE_MS = 300;

/**
 * Live avatar preview shown next to the name field on the create-agent form.
 *
 * The avatar seeds from the technical name (the slug), not the display name.
 * The endpoint is per-installation, but DiceBear output is identical across
 * installations, so this cosmetic preview stays decoupled from cluster
 * reachability: it uses the selected installation if one is picked, else the
 * first configured installation that has a base domain, so the preview appears
 * as soon as a name is typed. It uses the no-cache `/preview/` route and
 * debounces the slug.
 */
export function AgentAvatarPreview() {
  const { state } = useNewAgentForm();
  const { installations } = useInstallations();
  const buildAvatarUrl = useAgentAvatarUrl();

  const previewInstallation =
    state.installation ?? installations.find(i => i.baseDomain)?.name;

  const [debouncedSlug, setDebouncedSlug] = useState(state.slug);
  useDebounce(() => setDebouncedSlug(state.slug), DEBOUNCE_MS, [state.slug]);

  const url = buildAvatarUrl(previewInstallation, debouncedSlug, {
    size: PREVIEW_AVATAR_SIZE,
    preview: true,
  });

  return (
    <Avatar
      // The name is shown in the adjacent field, so keep the avatar decorative.
      purpose="decoration"
      name={state.name || state.slug}
      src={url ?? ''}
      // `large` keeps the two-initial fallback; the inline size overrides the
      // token's fixed dimensions to make the preview larger.
      size="large"
      style={{ width: PREVIEW_AVATAR_PX, height: PREVIEW_AVATAR_PX }}
    />
  );
}
