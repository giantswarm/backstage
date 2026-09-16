import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  NumberField,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import { dump } from 'js-yaml';

import {
  useAccelerators,
  useClusterManagerInfo,
  useManagedClusters,
  useNodePoolWrite,
} from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_SERVER,
  DEFAULT_ACCELERATORS,
  describeComponent,
  describeReleaseGroup,
  groupManifestsByRelease,
  isValidPoolName,
  manifestFilename,
  type CreateNodePoolInput,
  type ManagedCluster,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';
import { CodeBlock } from '../CodeBlock';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { DIALOG_FORM_STYLE } from '../dialogForm';

export type AddGpuNodePoolDialogProps = {
  /** The installations whose muster lists cluster-manager. */
  installations: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** After a Deploy: the pool was applied as the person. */
  onDeployed?: (result: NodePoolWriteResult) => void;
};

type TeleportChoice = 'default' | 'on' | 'off';

const TELEPORT_OPTIONS: { id: TeleportChoice; label: string }[] = [
  {
    id: 'default',
    label: 'Cluster default (on when the cluster has a join token)',
  },
  { id: 'on', label: 'Join the nodes to Teleport' },
  { id: 'off', label: 'Do not join Teleport' },
];

/** The marks `list_clusters` reports for one cluster, as one line each. */
export function clusterMarks(cluster: ManagedCluster): string[] {
  const marks = [
    cluster.ownCluster ? "The installation's own cluster" : 'Workload cluster',
    describeComponent(cluster.gpuOperator, 'GPU operator'),
    describeComponent(cluster.serving, 'Model serving'),
    cluster.commitTarget
      ? `Commit target: ${cluster.commitTarget.repository} (${cluster.commitTarget.path})`
      : 'Commit target: none (no git repository owns this cluster)',
  ];
  if (cluster.poolReleases.length > 0) {
    marks.push(
      `GPU pools: ${cluster.poolReleases.map(release => release.name).join(', ')}`,
    );
  }
  return marks;
}

/**
 * Add GPU node pool — from the Models pages, the agent-creation pattern:
 * a form, then `create_node_pool` with `dryRun` through muster as the
 * signed-in person, the composed releases as manifests in one review, and
 * **Deploy** (`mode: apply`) or **Commit** (`mode: commit`, once
 * cluster-manager offers it). The portal composes nothing: what the review
 * shows is exactly what cluster-manager would write.
 */
export function AddGpuNodePoolDialog({
  installations,
  isOpen,
  onOpenChange,
  onDeployed,
}: AddGpuNodePoolDialogProps) {
  const [installation, setInstallation] = useState<string | undefined>(
    installations[0],
  );
  const [clusterName, setClusterName] = useState<string>();
  const [name, setName] = useState('');
  const [accelerator, setAccelerator] = useState<string>(
    DEFAULT_ACCELERATORS[0],
  );
  const [maxGpus, setMaxGpus] = useState(4);
  const [teleport, setTeleport] = useState<TeleportChoice>('default');
  const [review, setReview] = useState<NodePoolWriteResult>();
  const [applied, setApplied] = useState<NodePoolWriteResult>();
  const [committed, setCommitted] = useState<NodePoolWriteResult>();

  const {
    clusters,
    clusterApiNote: noClusterApi,
    isLoading: clustersLoading,
    error: clustersError,
  } = useManagedClusters(installation);
  const { info } = useClusterManagerInfo(installation);
  const accelerators = useAccelerators(installation) ?? DEFAULT_ACCELERATORS;
  const write = useNodePoolWrite(installation);

  useEffect(() => {
    if (!installation && installations.length > 0) {
      setInstallation(installations[0]);
    }
  }, [installation, installations]);

  useEffect(() => {
    if (!isOpen) {
      setReview(undefined);
      setApplied(undefined);
      setCommitted(undefined);
      write.reset();
    }
    // `write` changes identity every render; reset once per close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const cluster = useMemo(
    () => clusters.find(candidate => candidate.name === clusterName),
    [clusters, clusterName],
  );

  const input: CreateNodePoolInput | undefined = useMemo(() => {
    if (!cluster || !isValidPoolName(name)) {
      return undefined;
    }
    return {
      cluster: cluster.name,
      namespace: cluster.namespace,
      name,
      accelerator,
      maxGpus,
      ...(teleport === 'default' ? {} : { teleport: teleport === 'on' }),
    };
  }, [cluster, name, accelerator, maxGpus, teleport]);

  const canCommit = info?.modes.commit === true;
  const notConnected = write.failure?.kind === 'not-connected';
  const isBusy = write.isBusy;
  const done = Boolean(applied || committed?.pullRequestUrl);

  const onReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!input) {
      return;
    }
    try {
      setReview(await write.dryRun(input));
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onDeploy = async () => {
    if (!input) {
      return;
    }
    try {
      const result = await write.create(input, 'apply');
      setApplied(result);
      onDeployed?.(result);
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onCommit = async () => {
    if (!input) {
      return;
    }
    try {
      setCommitted(await write.create(input, 'commit'));
    } catch {
      // Shown from `write.failure`.
    }
  };

  const close = (next: boolean) => {
    if (!isBusy) {
      onOpenChange(next);
    }
  };

  const groups = review ? groupManifestsByRelease(review) : [];

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      width="min(90vw, 860px)"
    >
      <form onSubmit={onReview} style={DIALOG_FORM_STYLE}>
        <DialogHeader>Add GPU node pool</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              GPU capacity for the models served on this installation. The pool,
              the GPU operator where the cluster has none and model serving
              where it has none are composed by cluster-manager and written as
              you.
            </Text>

            {!review && (
              <Flex direction="column" gap="3">
                {installations.length > 1 && (
                  <Select
                    label="Installation"
                    isRequired
                    options={installations.map(id => ({ id, label: id }))}
                    selectedKey={installation ?? null}
                    onSelectionChange={key => {
                      if (key) {
                        setInstallation(String(key));
                        setClusterName(undefined);
                      }
                    }}
                  />
                )}
                <Select
                  label="Cluster"
                  isRequired
                  placeholder={
                    clustersLoading
                      ? 'Reading clusters…'
                      : clusters.length === 0
                        ? 'No clusters'
                        : 'Pick a cluster'
                  }
                  options={clusters.map(candidate => ({
                    id: candidate.name,
                    label: `${candidate.name} (${candidate.organization}${
                      candidate.ownCluster ? ', own cluster' : ''
                    })`,
                  }))}
                  selectedKey={clusterName ?? null}
                  onSelectionChange={key =>
                    setClusterName(key ? String(key) : undefined)
                  }
                />
                {cluster && (
                  <Flex direction="column" gap="1" data-testid="cluster-marks">
                    {clusterMarks(cluster).map(mark => (
                      <Text key={mark} variant="body-small" color="secondary">
                        {mark}
                      </Text>
                    ))}
                  </Flex>
                )}
                {!clustersLoading && clusters.length === 0 && noClusterApi && (
                  <Alert
                    status="info"
                    title="No clusters on this installation"
                    description={noClusterApi}
                    data-testid="cluster-api-note"
                  />
                )}
                {clustersError && (
                  <Alert
                    status="warning"
                    title="Clusters could not be read"
                    description={clustersError.message}
                  />
                )}
                <TextField
                  label="Pool name"
                  isRequired
                  description="Five to twenty lowercase letters, digits and dashes (gpu00, gpu-l4). The MachinePool is named <cluster>-<name>."
                  value={name}
                  onChange={setName}
                  isInvalid={name.length > 0 && !isValidPoolName(name)}
                />
                <Select
                  label="Accelerator"
                  isRequired
                  options={accelerators.map(id => ({ id, label: id }))}
                  selectedKey={accelerator}
                  onSelectionChange={key => key && setAccelerator(String(key))}
                />
                <NumberField
                  label="Maximum GPUs"
                  description="Across all nodes of the pool; the pool scales to zero."
                  minValue={1}
                  value={maxGpus}
                  onChange={value =>
                    setMaxGpus(Number.isFinite(value) ? value : 1)
                  }
                />
                <Select
                  label="Teleport"
                  options={TELEPORT_OPTIONS}
                  selectedKey={teleport}
                  onSelectionChange={key =>
                    key && setTeleport(key as TeleportChoice)
                  }
                />
              </Flex>
            )}

            {review && (
              <Flex direction="column" gap="3" data-testid="node-pool-review">
                <Text variant="body-medium">
                  {review.cluster}-{review.pool}: gpu-node-pool chart{' '}
                  {review.chartVersion ?? '?'}, Kubernetes{' '}
                  {review.kubernetesVersion ?? '?'} (control plane{' '}
                  {review.controlPlaneVersion ?? '?'}).
                  {review.machineImage ? ` Image ${review.machineImage}.` : ''}
                </Text>
                <Text variant="body-small" color="secondary">
                  {review.objects
                    .map(
                      object =>
                        `${object.kind} ${object.namespace}/${object.name}: ${object.action}`,
                    )
                    .join(' · ')}
                </Text>
                {review.backend && (
                  <Text variant="body-small" color="secondary">
                    Serving backend registered with model-manager:{' '}
                    {review.backend.name} → {review.backend.target}
                  </Text>
                )}
                {groups.map(group => (
                  <Flex key={group.name} direction="column" gap="2">
                    <Text variant="body-medium">
                      {describeReleaseGroup(group)}
                    </Text>
                    {group.manifests.map(manifest => {
                      const filename = manifestFilename(manifest);
                      const content = dump(manifest, { noRefs: true });
                      return (
                        <Flex key={filename} direction="column" gap="1">
                          <CodeBlock
                            filename={filename}
                            content={content}
                            language="yaml"
                          />
                          <Flex gap="2">
                            <Button
                              size="small"
                              variant="tertiary"
                              onPress={() =>
                                navigator.clipboard?.writeText(content)
                              }
                            >
                              Copy
                            </Button>
                            <Button
                              size="small"
                              variant="tertiary"
                              onPress={() => downloadText(filename, content)}
                            >
                              Download
                            </Button>
                          </Flex>
                        </Flex>
                      );
                    })}
                  </Flex>
                ))}
                {!canCommit && (
                  <Text variant="body-small" color="secondary">
                    Commit — a pull request in the repository owning the cluster
                    — is not available yet on this installation's
                    cluster-manager.
                  </Text>
                )}
              </Flex>
            )}

            {write.failure && !notConnected && (
              <Alert
                status="danger"
                title="cluster-manager refused"
                description={write.failure.message}
              />
            )}
            {notConnected && installation && (
              <ConnectAgentManagerAlert
                installation={installation}
                message={write.failure!.message}
                action="GPU node pools are created"
                server={CLUSTER_MANAGER_SERVER}
              />
            )}
            {applied && (
              <Alert
                status="success"
                title={`Pool ${applied.cluster}-${applied.pool} applied as you`}
                description={applied.objects
                  .map(
                    object => `${object.kind} ${object.name}: ${object.action}`,
                  )
                  .join(' · ')}
              />
            )}
            {committed && <CommitOutcome result={committed} />}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Flex gap="2" justify="end">
            <Button
              variant="secondary"
              onPress={() => close(false)}
              isDisabled={isBusy}
            >
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!review && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={!input || isBusy}
              >
                {isBusy ? 'Rendering…' : 'Review'}
              </Button>
            )}
            {review && !done && (
              <>
                <Button
                  variant="secondary"
                  onPress={() => setReview(undefined)}
                  isDisabled={isBusy}
                >
                  Back
                </Button>
                <Button
                  variant="secondary"
                  onPress={onCommit}
                  isDisabled={!canCommit || isBusy}
                  aria-label={
                    canCommit ? 'Commit' : 'Commit (not available yet)'
                  }
                >
                  {canCommit ? 'Commit' : 'Commit (not available yet)'}
                </Button>
                <Button
                  variant="primary"
                  onPress={onDeploy}
                  isDisabled={isBusy}
                >
                  {isBusy ? 'Deploying…' : 'Deploy'}
                </Button>
              </>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
