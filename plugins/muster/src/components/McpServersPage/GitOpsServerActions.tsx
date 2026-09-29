import { ReactNode, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Skeleton,
  Text,
} from '@backstage/ui';
import Edit from '@material-ui/icons/Edit';
import {
  GitOpsSource,
  useGitOpsSource,
} from '@giantswarm/backstage-plugin-flux-react';
import {
  ExternalLink,
  GitOpsManagedLabel,
  YamlEditorFormField,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer } from '../../lib/k8s';
import {
  gitOpsLabelSource,
  gitOpsManagerDescription,
  readProvenance,
  toManifestYaml,
} from '../../lib/gitops';

function qualifiedName(name: string, namespace?: string) {
  return namespace ? `${namespace}/${name}` : name;
}

function displayPath(path?: string) {
  const trimmed = path?.replace(/^\.?\/+/, '');
  return trimmed || 'the repository root';
}

function SourceStep({ source }: { source: GitOpsSource }) {
  if (source.isLoading) {
    return <Skeleton width={240} height={16} />;
  }
  return (
    <>
      Open{' '}
      <ExternalLink href={source.url!}>
        {displayPath(source.kustomization?.path)}
      </ExternalLink>{' '}
      in the GitOps repository.
    </>
  );
}

/**
 * How to change a GitOps-managed server in Git: GitOps-managed servers are
 * read-only in the app, since the reconciler would revert a live change. The
 * steps depend on what is in Git — the MCPServer manifest itself, or the
 * values of the HelmRelease that renders it.
 */
function GitOpsEditDialog({
  server,
  source,
  isOpen,
  onOpenChange,
}: {
  server: MCPServer;
  source: GitOpsSource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const manifest = toManifestYaml(server);
  const name = server.getName();
  const namespace = server.getNamespace();
  // Loading counts as known: the hop to a HelmRelease is still resolving, and
  // the steps would otherwise flash "could not be found" first.
  const known = source.isLoading || (source.inGit && Boolean(source.url));
  const chartRendered = Boolean(source.helmRelease);
  const manager = gitOpsManagerDescription(readProvenance(server));
  // Named the way the Git host names it; unknown until the GitRepository is.
  const changeRequest =
    source.changeRequestTerm ?? 'pull request (merge request on GitLab)';

  const copy = () => {
    navigator.clipboard?.writeText(manifest).catch(() => undefined);
  };

  let steps: ReactNode;
  if (known && source.helmRelease) {
    steps = (
      <ol>
        <li>
          <SourceStep source={source} />
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
  } else if (known && source.kustomization) {
    steps = (
      <ol>
        <li>
          <SourceStep source={source} />
        </li>
        <li>
          Below that directory, find the file that declares{' '}
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
          To remove, delete the file and its entry in the{' '}
          <code>resources:</code> list of the <code>kustomization.yaml</code>{' '}
          next to it.
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
    steps = (
      <Text as="p" variant="body-medium">
        {manager ? (
          <>
            It is managed by {manager.kind} <code>{manager.id}</code>, but its
            source could not be found
          </>
        ) : (
          <>Its source could not be found</>
        )}
        {source.errorMessage ? <> ({source.errorMessage})</> : null}. Edit or
        remove its manifest in the GitOps repository that manages this
        installation, and open a {changeRequest}.
      </Text>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="min(90vw, 860px)"
    >
      <DialogHeader>
        Edit or remove <code>{name}</code>
      </DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-medium">
            This server is managed through GitOps. Flux would revert a change
            made here, so make it in Git.
          </Text>
          <Text as="div" variant="body-medium">
            {steps}
          </Text>
          {!chartRendered && (
            <Box>
              <YamlEditorFormField
                label="Current manifest"
                value={manifest}
                readOnly
                height={360}
                maxHeight={360}
              />
            </Box>
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        {!chartRendered && (
          <Button variant="secondary" onPress={copy}>
            Copy manifest
          </Button>
        )}
        <Button variant="primary" onPress={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export interface GitOpsServerActionsProps {
  server: MCPServer;
  /** The per-session Sign in / Sign out affordance, if any. */
  authActions?: ReactNode;
  className?: string;
}

/**
 * The action row of a GitOps-managed server: the GitOps claim with a link to
 * its source, the session auth actions, and Edit/Remove, which explains how to
 * make the change in Git rather than mutating the server live.
 */
export function GitOpsServerActions({
  server,
  authActions,
  className,
}: GitOpsServerActionsProps) {
  const source = useGitOpsSource(server, server.cluster);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Flex align="center" gap="2" className={className}>
      <GitOpsManagedLabel source={gitOpsLabelSource(source)} />
      {authActions}
      <Button
        size="small"
        variant="secondary"
        iconStart={<Edit fontSize="inherit" />}
        onPress={() => setEditOpen(true)}
      >
        Edit/Remove
      </Button>
      <GitOpsEditDialog
        server={server}
        source={source}
        isOpen={editOpen}
        onOpenChange={setEditOpen}
      />
    </Flex>
  );
}
