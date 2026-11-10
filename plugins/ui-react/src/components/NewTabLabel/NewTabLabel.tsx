import type { ReactNode } from 'react';
import { NewTabHint } from '../NewTabHint';

/**
 * A button's label followed by `NewTabHint`, in one box: bui's buttons lay
 * their content out with a gap, which would set the icon further off than in
 * a text link. For a bui `Button` that opens a tab from code; a `ButtonLink`
 * is `ExternalButtonLink`, which renders this.
 */
export const NewTabLabel = ({ children }: { children: ReactNode }) => (
  <span>
    {children}
    <NewTabHint />
  </span>
);
