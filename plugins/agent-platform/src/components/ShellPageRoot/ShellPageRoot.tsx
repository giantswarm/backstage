import type { ReactNode } from 'react';
import {
  PageHeaderActionsProvider,
  ShellDocumentTitle,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * The root of one of the shell's own pages (Sessions, Usage), rendered
 * without the app's page layout: the header-actions slot that layout would
 * provide, so the actions a view registers with
 * `useProvidePageHeaderActions` render in its frame's header, and the
 * page's name as the document title until the view names itself.
 *
 * No header of its own: every view in the shell draws its page frame itself
 * (`ShellPage`, `WizardFrame`) or redirects.
 */
export function ShellPageRoot({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <PageHeaderActionsProvider>
      <ShellDocumentTitle title={title} />
      {children}
    </PageHeaderActionsProvider>
  );
}
