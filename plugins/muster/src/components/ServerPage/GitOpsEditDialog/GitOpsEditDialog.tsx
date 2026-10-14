import { ReactNode, useMemo } from 'react';
import { Flex, Skeleton, Text } from '@backstage/ui';
import {
  GitOpsSource,
  useGitOpsSource,
} from '@giantswarm/backstage-plugin-flux-react';
import {
  ExternalLink,
  ManifestDialog,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer } from '../../../lib/k8s';
import {
  gitOpsManagerDescription,
  isChartRendered,
  qualifiedName,
  readProvenance,
  toManifestYaml,
} from '../../../lib/gitops';

function displayPath(path?: string) {
  const trimmed = path?.replace(/^\.?\/+/, '');
  return trimmed || 'the repository root';
}

/**
 * Where to start in Git. The Kustomization is known here, but a link needs
 * its GitRepository and a URL pattern for the host too — without them, the
 * step names the path, or else the Kustomization to look it up by.
 */
function SourceStep({
  source,
  kustomization,
}: {
  source: GitOpsSource;
  kustomization: NonNullable<GitOpsSource['kustomization']>;
}) {
  if (source.url) {
    return (
      <>
        Open{' '}
        <ExternalLink href={source.url}>
          {displayPath(kustomization.path)}
        </ExternalLink>{' '}
        in the GitOps repository.
      </>
    );
  }
  const reason = source.errorMessage ? <> ({source.errorMessage})</> : null;
  const id = (
    <code>{qualifiedName(kustomization.name, kustomization.namespace)}</code>
  );
  if (kustomization.path !== undefined) {
    return (
      <>
        Open <code>{displayPath(kustomization.path)}</code> in the Git
        repository Kustomization {id} reconciles from{reason}.
      </>
    );
  }
  return (
    <>
      Find the directory Kustomization {id} applies, in the Git repository it
      reconciles from{reason}.
    </>
  );
}

/**
 * How to change a GitOps-managed server in Git: GitOps-managed servers are
 * read-only in the app, since the reconciler would revert a live change. The
 * steps depend on what is in Git — the MCPServer manifest itself, or the
 * values of the HelmRelease that renders it. Render it for a managed server
 * only: it looks the server's GitOps source up. The shared `ManifestDialog`
 * with the steps above the manifest (none for a chart-rendered server, whose
 * rendered manifest is not what anyone edits).
 */
export function GitOpsEditDialog({
  server,
  isOpen,
  onOpenChange,
}: {
  server: MCPServer;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const source = useGitOpsSource(server, server.cluster);
  // Always mounted, so only serialised while it is shown.
  const manifest = useMemo(
    () => (isOpen ? toManifestYaml(server) : ''),
    [isOpen, server],
  );
  const name = server.getName();
  const namespace = server.getNamespace();
  const provenance = readProvenance(server);
  const manager = gitOpsManagerDescription(provenance);
  const chartRendered =
    Boolean(source.helmRelease) || isChartRendered(provenance);
  // Named the way the Git host names it; unknown until the GitRepository is.
  const changeRequest =
    source.changeRequestTerm ?? 'pull request (merge request on GitLab)';

  let steps: ReactNode;
  if (source.isLoading) {
    // Which steps apply is only known once the chain has resolved.
    steps = (
      <Flex direction="column" gap="2">
        <Skeleton width="60%" height={16} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="70%" height={16} />
      </Flex>
    );
  } else if (source.kustomization && source.helmRelease) {
    steps = (
      <ol>
        <li>
          <SourceStep source={source} kustomization={source.kustomization} />
        </li>
        <li>
          Find where HelmRelease{' '}
          <code>
            {qualifiedName(
              source.helmRelease.name,
              source.helmRelease.namespace,
            )}
          </code>{' '}
          and its values (inline <code>values</code> or <code>valuesFrom</code>)
          are defined: in that directory, or in a base its{' '}
          <code>kustomization.yaml</code> pulls in.
        </li>
        <li>
          To edit, change the values entry that renders <code>{name}</code>. To
          remove, delete that entry. Don&apos;t edit or add an MCPServer file:
          the chart would render the server again.
        </li>
        <li>Open a {changeRequest}. Once merged, Flux applies it.</li>
      </ol>
    );
  } else if (source.kustomization) {
    steps = (
      <ol>
        <li>
          <SourceStep source={source} kustomization={source.kustomization} />
        </li>
        <li>
          Below that directory, find the YAML document that declares{' '}
          <code>kind: MCPServer</code> with <code>name: {name}</code>
          {namespace ? (
            <>
              {' '}
              in namespace <code>{namespace}</code>
            </>
          ) : null}
          .
        </li>
        <li>
          To edit, change its <code>spec</code> (the current manifest is below).
          To remove, delete that document; if the file is then empty, delete it
          too, along with its entry under <code>resources:</code> in the{' '}
          <code>kustomization.yaml</code> next to it, if there is one.
        </li>
        <li>
          Open a {changeRequest}. Once merged, Flux applies it when
          Kustomization{' '}
          <code>
            {qualifiedName(
              source.kustomization.name,
              source.kustomization.namespace,
            )}
          </code>{' '}
          next reconciles.
        </li>
      </ol>
    );
  } else {
    const managedBy = manager ? (
      <>
        It is managed by {manager.kind} <code>{manager.id}</code>, but its
        source could not be found
      </>
    ) : (
      <>Its source could not be found</>
    );
    const reason = source.errorMessage ? <> ({source.errorMessage})</> : null;
    steps = (
      <Text as="p" variant="body-medium">
        {managedBy}
        {reason}.{' '}
        {chartRendered ? (
          <>
            Change the values that render <code>{name}</code> where that release
            is defined in Git, and open a {changeRequest}.
          </>
        ) : (
          <>
            Edit or remove its manifest in the GitOps repository that manages
            this installation, and open a {changeRequest}.
          </>
        )}
      </Text>
    );
  }

  return (
    <ManifestDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={
        <>
          Edit or remove <code>{name}</code>
        </>
      }
      label="Current manifest"
      manifest={chartRendered ? undefined : manifest}
    >
      <Text as="p" variant="body-medium">
        Managed through GitOps: make the change in Git, or Flux reverts it.
      </Text>
      <Text as="div" variant="body-medium">
        {steps}
      </Text>
    </ManifestDialog>
  );
}
