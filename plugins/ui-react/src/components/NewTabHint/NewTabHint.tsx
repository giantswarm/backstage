import type { ReactNode } from 'react';
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

/** Holds the last word and the launch icon on one line. */
const NO_WRAP = { whiteSpace: 'nowrap' } as const;

/**
 * A link's or button's text followed by `NewTabHint`, the icon held to the
 * text's last word so a line never breaks between them and leaves the icon
 * on a line of its own. Text that is not a plain string is followed by the
 * hint as it is.
 */
export const WithNewTabHint = ({ children }: { children: ReactNode }) => {
  if (typeof children === 'string') {
    const match = children.match(/^([\s\S]*\s)?(\S+)\s*$/);
    if (match) {
      return (
        <>
          {match[1]}
          <span style={NO_WRAP}>
            {match[2]}
            <NewTabHint />
          </span>
        </>
      );
    }
  }
  return (
    <>
      {children}
      <NewTabHint />
    </>
  );
};
