import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@backstage/ui';

import type { ServedModelGroup } from './ServedModelsTable';
import { ServedModelsGroupHeader } from './ServedModelsGroupHeader';

export type ServedModelsGroupCardProps = {
  group: ServedModelGroup;
  /** Whether the header names the installation (the page lists several). */
  showInstallation: boolean;
  /** What trails the header: the backend's source and Remove backend. */
  actions?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
};

/**
 * One installation's backend as a card: {@link ServedModelsGroupHeader} as
 * its header, the group's table — or, for a backend that serves nothing yet,
 * the note saying so — as its body.
 */
export function ServedModelsGroupCard({
  group,
  showInstallation,
  actions,
  children,
  'data-testid': testId,
}: ServedModelsGroupCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <ServedModelsGroupHeader
          group={group}
          showInstallation={showInstallation}
          actions={actions}
        />
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}
