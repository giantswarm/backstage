import { type ReactNode, useId } from 'react';
import { Flex, Skeleton, Text, VisuallyHidden } from '@backstage/ui';
import { CodeBlock, ExternalLink } from '@giantswarm/backstage-plugin-ui-react';
import { TerminalIcon } from '../../../assets/icons/CustomIcons';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import {
  getControlPlaneNodeAccessCommand,
  getNodeResourcesURL,
  getSpecificNodeAccessCommandExample,
  getWorkerNodeAccessCommand,
} from '../../clusters/cluster-details/ClusterSSHAccess/ClusterSSHAccessCard/utils';
import { PlatformPanel } from '../PlatformPanel';

/** A group of the panel: its `h3`, then what follows it. */
function Command({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <Flex direction="column" gap="2">
        <Text as="h3" id={headingId} variant="body-medium" color="secondary">
          {title}
        </Text>
        {children}
      </Flex>
    </section>
  );
}

/**
 * The SSH access tab of a Platform cluster page, for Giant Swarm staff: the
 * Teleport commands that open a shell on the cluster's control plane nodes,
 * its worker nodes or one node, as the classic cluster page's SSH access tab
 * has them, and a link to the cluster's nodes in Teleport.
 */
export function PlatformClusterSSHAccess() {
  const { cluster, installationName } = useCurrentCluster();
  const clusterName = cluster.getName();
  return (
    <PlatformPanel
      title="SSH access"
      icon={<TerminalIcon fontSize="inherit" />}
    >
      <Text as="p" variant="body-medium">
        Selecting a node to connect to can be done via tags or using the node
        name.
      </Text>
      <Command title="Control plane nodes">
        <CodeBlock
          text={getControlPlaneNodeAccessCommand(clusterName, installationName)}
          language="bash"
        />
      </Command>
      <Command title="Worker nodes">
        <CodeBlock
          text={getWorkerNodeAccessCommand(clusterName, installationName)}
          language="bash"
        />
      </Command>
      <Command title="Specific node">
        <Text as="p" variant="body-medium">
          This requires you to specify the hostname as the node tag value.
          Example:
        </Text>
        <CodeBlock
          text={getSpecificNodeAccessCommandExample(installationName)}
          language="bash"
        />
        <Text as="p" variant="body-medium">
          Find all nodes via the{' '}
          <ExternalLink
            href={getNodeResourcesURL(clusterName, installationName)}
            display="inline"
          >
            Teleport resources UI
          </ExternalLink>
          .
        </Text>
      </Command>
    </PlatformPanel>
  );
}

/**
 * The SSH access tab while the person's access is read: the panel with its
 * groups' captions and code blocks as skeletons, in the tab's final shape.
 */
export function PlatformClusterSSHAccessSkeleton() {
  return (
    <PlatformPanel
      title="SSH access"
      icon={<TerminalIcon fontSize="inherit" />}
    >
      <div role="status">
        <VisuallyHidden>Reading your access…</VisuallyHidden>
        <Flex direction="column" gap="3" aria-hidden>
          <Skeleton width="60%" height={20} />
          {[0, 1, 2].map(index => (
            <Flex key={index} direction="column" gap="2">
              <Skeleton width={140} height={20} />
              <Skeleton width="100%" height={40} />
            </Flex>
          ))}
        </Flex>
      </div>
    </PlatformPanel>
  );
}
