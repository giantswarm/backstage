import { VisuallyHidden } from '@backstage/ui';
import { styled } from '@material-ui/core';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';

const StyledLaunchOutlinedIcon = styled(LaunchOutlinedIcon)(({ theme }) => ({
  marginLeft: theme.spacing(0.5),
  fontSize: 'inherit',
  // In running text, the icon sits on the line like a letter; a flex parent
  // ignores this.
  verticalAlign: 'text-bottom',
}));

/**
 * What marks a link or button that opens a new tab, inside it after its text:
 * the launch icon to the eye and "(opens in a new tab)" to a screen reader.
 * `ExternalLink`, `ExternalButtonLink` and `ExternalCellText` render it; use
 * one of them, or `NewTabLabel` in a `Button` that opens a tab from code,
 * rather than placing it by hand.
 */
export const NewTabHint = () => (
  <>
    <StyledLaunchOutlinedIcon aria-hidden />
    <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
  </>
);
