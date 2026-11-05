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
 * What marks a link that opens in a new tab, inside the link: the launch icon
 * to the eye and "(opens in a new tab)" to a screen reader. Shared by
 * `ExternalLink` and `ExternalCellText`, so the two say it alike.
 */
export const NewTabHint = () => (
  <>
    <StyledLaunchOutlinedIcon aria-hidden />
    <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
  </>
);
