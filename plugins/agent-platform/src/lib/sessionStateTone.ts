import { SessionStateTone } from '@giantswarm/backstage-plugin-agent-platform-common';
import { Theme } from '@material-ui/core';

/**
 * Tone to colour. bui's `Badge` takes no tone in this version, so the dot is
 * hand-drawn — which is also what `PullReviewPage` does for its status dots.
 *
 * Shared, so the rail's group dots and the sessions list's state dots cannot
 * come out different colours for one state.
 */
export function toneColor(tone: SessionStateTone, theme: Theme): string {
  switch (tone) {
    case 'warning':
      return theme.palette.warning.main;
    case 'info':
      return theme.palette.info.main;
    case 'success':
      return theme.palette.success.main;
    case 'danger':
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
}
