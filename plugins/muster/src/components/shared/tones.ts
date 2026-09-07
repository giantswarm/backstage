import { Tone } from '@giantswarm/backstage-plugin-ui-react';
import { MCPServerSeverity } from '../../lib/k8s';

/**
 * The tone palette moved to `ui-react` once a second plugin needed it; this
 * re-export keeps muster's own ~13 importers on a local path.
 */
export { toneColors, VIOLET } from '@giantswarm/backstage-plugin-ui-react';
export type { Tone, ToneColors } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Maps the MCPServer severity used across the plugin onto a badge tone.
 *
 * Stays here rather than moving with the palette: it takes a muster type, so a
 * generic component library has no business knowing about it.
 */
export function severityTone(severity: MCPServerSeverity): Tone {
  switch (severity) {
    case 'ok':
      return 'ok';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}
