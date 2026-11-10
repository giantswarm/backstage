import { ButtonLink, type ButtonLinkProps } from '@backstage/ui';
import { NewTabLabel } from '../NewTabLabel';

export type ExternalButtonLinkProps = Omit<
  ButtonLinkProps,
  'target' | 'rel' | 'iconEnd' | 'href'
> & { href: string };

/**
 * bui's `ButtonLink` for a button that leaves the app: it opens in a new tab,
 * and says so as `ExternalLink` does, with the launch icon after the label and
 * "(opens in a new tab)" for a screen reader. The launch icon is the last
 * thing in the button, so it takes no `iconEnd`; everything else (variant,
 * size, `iconStart`, `onPress`) is `ButtonLink`'s own.
 */
export const ExternalButtonLink = ({
  children,
  ...props
}: ExternalButtonLinkProps) => (
  <ButtonLink {...props} target="_blank" rel="noopener noreferrer">
    <NewTabLabel>{children}</NewTabLabel>
  </ButtonLink>
);
