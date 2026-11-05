import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link } from '@backstage/ui';
import { InfoHint } from '@giantswarm/backstage-plugin-ui-react';

import { organizationDetailRouteRef } from '../../routes';
import type { OrganizationNamespace } from '../../lib/organizations';
import {
  organizationOf,
  ownerOf,
  PLATFORM_TENANT_NAMESPACE,
} from '../../lib/tenants';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

/** What an agent owned by the platform means. */
export const PLATFORM_OWNER_HINT = 'Available to all organizations';

export type OwnerValueProps = {
  /** The agent's namespace. */
  namespace: string;
  /** The agent's installation: an organization then links to its page. */
  installation?: string;
  className?: string;
};

/** An organization's name, linking to its page. */
function OrganizationLink({
  installation,
  organization,
  label,
}: {
  installation: string;
  organization: OrganizationNamespace;
  label: string;
}) {
  const organizationRoute = useRouteRef(organizationDetailRouteRef);
  const href = organizationRoute?.({
    installation,
    parent: organization.parent,
    name: organization.organization,
  });
  return href ? <Link href={href}>{label}</Link> : <>{label}</>;
}

/**
 * Who an agent belongs to, as a value under the label "Owner": the
 * organization's plain name, linking to the organization's page, as
 * agent-manager names the namespace's organization; or, for an agent of the
 * platform, which is no organization, "Platform" with an info icon that says
 * it is available to all of them. The icon is a button (`InfoHint`): its
 * tooltip shows on hover and keyboard focus, and a press opens the same text.
 */
export function OwnerValue({
  namespace,
  installation,
  className,
}: OwnerValueProps) {
  const { directory } = useOrganizationDirectory();
  const owner = ownerOf(namespace, directory);
  if (namespace !== PLATFORM_TENANT_NAMESPACE) {
    const organization = organizationOf(namespace, directory);
    return (
      <span className={className}>
        {organization && installation ? (
          <OrganizationLink
            installation={installation}
            organization={organization}
            label={owner}
          />
        ) : (
          owner
        )}
      </span>
    );
  }
  return (
    <span className={className}>
      {owner}{' '}
      <InfoHint label="What Platform means" size="medium">
        {PLATFORM_OWNER_HINT}
      </InfoHint>
    </span>
  );
}
