import { ButtonLink, type ButtonLinkProps } from '@backstage/ui';
import { NewTabHint } from '../ExternalLink/NewTabHint';

export type ExternalButtonLinkProps = Omit<ButtonLinkProps, 'target' | 'rel'>;

/**
 * bui's `ButtonLink` for a button that leaves the app: it opens in a new tab,
 * and says so as `ExternalLink` does, with the launch icon after the label and
 * "(opens in a new tab)" for a screen reader. Everything else (variant, size,
 * `onPress`) is `ButtonLink`'s own.
 */
export const ExternalButtonLink = ({
  children,
  ...props
}: ExternalButtonLinkProps) => (
  <ButtonLink {...props} target="_blank" rel="noopener noreferrer">
    {/* One box for the label and the hint: the button lays its content out
        with a gap, which would set the icon further off than in a text link. */}
    <span>
      {children}
      <NewTabHint />
    </span>
  </ButtonLink>
);
