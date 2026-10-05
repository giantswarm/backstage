import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Radio,
  RadioGroup,
  Skeleton,
  Text,
  TextField,
} from '@backstage/ui';

import { useClusterWrite } from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_SERVER,
  type ClusterWriteResult,
  type DeleteClusterInput,
  type WriteMode,
} from '../../lib/clusterManager';
import {
  judgeModes,
  modeBlocker,
  notConnectedOf,
  preferredMode,
  previewOf,
  type ModeVerdicts,
} from '../../lib/clusterWrites';
import { ClusterManagerCommitOutcome } from '../ClusterManagerCommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { PartialWriteOutcome } from '../GpuNodePools/PartialWriteOutcome';

export type DeleteClusterDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  installation: string;
  organization: string;
  name: string;
  /** Whether this installation's cluster-manager takes mode `commit` for `delete_cluster`. */
  commitOffered: boolean;
};

/**
 * Delete cluster — cluster-manager's `delete_cluster` through muster as the
 * signed-in person, behind typing the cluster's name. On opening it shows both
 * modes' dry runs: what goes with the cluster (its GPU pools, operator and
 * serving slice, the models served on it), or the refusal with its reason and
 * the way out. **Delete** removes the cluster's release as the person and
 * offers **Finish removal**, the second call cluster-manager names once the
 * cluster is gone; **Commit** opens the removal pull request and, once it is
 * merged, offers the live step its answer names.
 */
export function DeleteClusterDialog({
  isOpen,
  onOpenChange,
  installation,
  organization,
  name,
  commitOffered,
}: DeleteClusterDialogProps) {
  const write = useClusterWrite(installation);
  const [verdicts, setVerdicts] = useState<ModeVerdicts>();
  const [mode, setMode] = useState<WriteMode>();
  const [typed, setTyped] = useState('');
  const [removed, setRemoved] = useState<ClusterWriteResult>();
  const [committed, setCommitted] = useState<ClusterWriteResult>();
  const input: DeleteClusterInput = { organization, name };

  /** The dry runs, again after a refusal the person has dealt with. */
  const check = async () => {
    setVerdicts(undefined);
    const judged = await judgeModes(
      dryRunMode => write.remove(input, { mode: dryRunMode, dryRun: true }),
      commitOffered,
    );
    write.reset();
    setVerdicts(judged);
    setMode(preferredMode(judged));
  };

  useEffect(() => {
    if (isOpen) {
      check();
    } else {
      setVerdicts(undefined);
      setMode(undefined);
      setTyped('');
      setRemoved(undefined);
      setCommitted(undefined);
      write.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, installation, organization, name]);

  /** Delete, Continue after a partial answer, Finish removal and the live step after a merge: the same call. */
  const onDelete = async () => {
    try {
      setRemoved(await write.remove(input, { mode: 'apply' }));
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onCommit = async () => {
    try {
      setCommitted(await write.remove(input, { mode: 'commit' }));
    } catch {
      // Shown from `write.failure`.
    }
  };

  const close = (next: boolean) => {
    if (!write.isBusy) {
      onOpenChange(next);
    }
  };

  const checking = isOpen && !verdicts;
  const confirmed = typed === name;
  const started = Boolean(removed || committed);
  const notConnected =
    write.failure?.kind === 'not-connected'
      ? write.failure
      : notConnectedOf(verdicts);
  const preview = previewOf(verdicts);
  const refusedEverywhere = Boolean(verdicts) && !preview && !notConnected;
  const secondPass = removed && !removed.partial && removed.nextStep;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      isDismissable={!write.isBusy}
      isKeyboardDismissDisabled={write.isBusy}
      width="min(90vw, 720px)"
    >
      <DialogHeader>Delete cluster {name}?</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text variant="body-medium">
            Removes {name} from {installation} as you, through cluster-manager:
            helm-controller uninstalls the cluster and its default apps, and
            what cluster-manager created on it goes with it.
          </Text>

          {checking && (
            <Flex direction="column" gap="1" data-testid="delete-checking">
              <Text variant="body-small" color="secondary">
                Checking what goes with the cluster…
              </Text>
              <Skeleton width="100%" height={48} />
            </Flex>
          )}

          {preview && !started && <WhatGoes result={preview} />}

          {refusedEverywhere && verdicts && (
            <Alert
              status="warning"
              data-testid="delete-refused"
              title="cluster-manager refuses to delete this cluster"
              description={
                <Flex direction="column" gap="2">
                  {[modeBlocker(verdicts.apply), modeBlocker(verdicts.commit)]
                    .filter((reason): reason is string => Boolean(reason))
                    .filter(
                      (reason, index, all) => all.indexOf(reason) === index,
                    )
                    .map(reason => (
                      <Text key={reason} variant="body-small">
                        {reason}
                      </Text>
                    ))}
                  <div>
                    <Button
                      variant="secondary"
                      size="small"
                      onPress={check}
                      isDisabled={write.isBusy}
                    >
                      Check again
                    </Button>
                  </div>
                </Flex>
              }
            />
          )}

          {preview && verdicts && !started && (
            <>
              <RadioGroup
                label="How"
                value={mode ?? null}
                onChange={value => setMode(value as WriteMode)}
                isDisabled={write.isBusy}
              >
                <Radio
                  value="commit"
                  isDisabled={verdicts.commit.state !== 'ready'}
                >
                  Commit — the removal as a pull request as you in the
                  repository that owns the cluster
                </Radio>
                <Radio
                  value="apply"
                  isDisabled={verdicts.apply.state !== 'ready'}
                >
                  Delete — remove it from the installation as you, now
                </Radio>
              </RadioGroup>
              {[
                ['Commit', modeBlocker(verdicts.commit)],
                ['Delete', modeBlocker(verdicts.apply)],
              ]
                .filter(([, reason]) => reason)
                .map(([label, reason]) => (
                  <Text
                    key={label}
                    variant="body-small"
                    color="secondary"
                    data-testid="mode-blocker"
                  >
                    {label} is not possible: {reason}
                  </Text>
                ))}
              <TextField
                label={`Type ${name} to confirm`}
                value={typed}
                onChange={setTyped}
                isRequired
              />
            </>
          )}

          {write.failure && write.failure.kind !== 'not-connected' && (
            <Alert
              status="danger"
              title="cluster-manager refused"
              description={write.failure.message}
            />
          )}
          {notConnected && (
            <ConnectAgentManagerAlert
              installation={installation}
              message={notConnected.message}
              action="Clusters are deleted"
              server={CLUSTER_MANAGER_SERVER}
            />
          )}
          {removed?.partial && (
            <PartialWriteOutcome
              result={removed}
              action="Delete"
              onContinue={onDelete}
              isBusy={write.isBusy}
            />
          )}
          {removed && !removed.partial && (
            <Alert
              status="success"
              data-testid="delete-outcome"
              title={`Removed as you: ${removed.objects.length} ${
                removed.objects.length === 1 ? 'object' : 'objects'
              }`}
              description={
                <Flex direction="column" gap="2">
                  <Text variant="body-small" color="secondary">
                    {removed.objects
                      .map(
                        object =>
                          `${object.kind} ${object.name}: ${object.action}`,
                      )
                      .join(' · ')}
                  </Text>
                  {(removed.warnings ?? []).map(warning => (
                    <Text key={warning} variant="body-small">
                      {warning}
                    </Text>
                  ))}
                  {secondPass && (
                    <>
                      <Text variant="body-small">{removed.nextStep}</Text>
                      <div>
                        <Button
                          variant="secondary"
                          size="small"
                          onPress={onDelete}
                          isDisabled={write.isBusy}
                        >
                          {write.isBusy ? 'Removing…' : 'Finish removal'}
                        </Button>
                      </div>
                    </>
                  )}
                </Flex>
              }
            />
          )}
          {committed?.commit && (
            <ClusterManagerCommitOutcome
              commit={committed.commit}
              liveStep={
                !removed && (
                  <Button
                    variant="secondary"
                    size="small"
                    onPress={onDelete}
                    isDisabled={write.isBusy}
                  >
                    {write.isBusy ? 'Running…' : 'Merged: run the live step'}
                  </Button>
                )
              }
            />
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Flex gap="2" justify="end">
          <Button
            variant="secondary"
            onPress={() => close(false)}
            isDisabled={write.isBusy}
          >
            {started ? 'Close' : 'Cancel'}
          </Button>
          {!started && (
            <Button
              variant="primary"
              destructive
              onPress={mode === 'commit' ? onCommit : onDelete}
              isDisabled={!preview || !mode || !confirmed || write.isBusy}
            >
              {deleteLabel(mode, write.isBusy)}
            </Button>
          )}
        </Flex>
      </DialogFooter>
    </Dialog>
  );
}

/** The dry run's answer: the releases and models that go with the cluster. */
function WhatGoes({ result }: { result: ClusterWriteResult }) {
  const withCluster = result.withCluster ?? [];
  const models = result.models ?? [];
  return (
    <Flex direction="column" gap="2" data-testid="what-goes">
      <Text variant="body-small">
        {withCluster.length === 0
          ? 'Nothing cluster-manager created goes with it besides the cluster.'
          : `Goes with the cluster: ${withCluster.join(', ')}.`}
      </Text>
      <Text variant="body-small">
        {servedModelsLine(result.modelsNote, models)}
      </Text>
      {result.objects.length > 0 && (
        <Text variant="body-small" color="secondary">
          {result.objects
            .map(
              object =>
                `${object.kind} ${object.namespace}/${object.name}: ${object.action}`,
            )
            .join(' · ')}
        </Text>
      )}
      {(result.warnings ?? []).map(warning => (
        <Text key={warning} variant="body-small" color="secondary">
          {warning}
        </Text>
      ))}
    </Flex>
  );
}

function servedModelsLine(note: string | undefined, models: string[]): string {
  if (note) {
    return `Served models: ${note}`;
  }
  return models.length === 0
    ? 'No model is served on it.'
    : `Served on it, and gone with it: ${models.join(', ')}.`;
}

function deleteLabel(mode: WriteMode | undefined, busy: boolean): string {
  if (mode === 'commit') {
    return busy ? 'Committing…' : 'Commit removal';
  }
  return busy ? 'Deleting…' : 'Delete cluster';
}
