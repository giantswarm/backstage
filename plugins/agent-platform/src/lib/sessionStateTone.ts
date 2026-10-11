import { SessionStateTone } from '@giantswarm/backstage-plugin-agent-platform-common';
import { Theme } from '@material-ui/core';

/**
 * Tone to colour, for the classic-chrome sessions table's state dots only.
 * Every shell surface draws session states with ui-react's `StatusDot` (bui
 * tokens behind `sessionStateDotVar`), so the shell's dots share one source.
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
