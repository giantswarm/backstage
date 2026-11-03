import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
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
import {
  BusyDialog,
  countNoun,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { useClusterWrite } from '../../hooks/useClusterManager';
import { useOpenGeneration } from '../../hooks/useOpenGeneration';
import {
  CLUSTER_MANAGER_SERVER,
  isNothingLeft,
  type ClusterWriteResult,
  type DeleteClusterInput,
  type WriteMode,
} from '../../lib/clusterManager';
import {
  judgeModes,
  modeBlocker,
  notConnectedOf,
  nothingLeftOf,
  preferredMode,
  previewOf,
  type ModeVerdicts,
} from '../../lib/clusterWrites';
import { ClusterManagerCommitOutcome } from '../ClusterManagerCommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { PartialWriteOutcome } from '../GpuNodePools/PartialWriteOutcome';
import {
  REMOVAL_CHECK_INTERVAL_MS,
  describeObject,
  describeObjects,
  formatClock,
  judgeNextPass,
  summarizePass,
  type NextPass,
  type RemovalPass,
} from './removalPasses';

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
 * the way out. **Delete** removes the cluster's release as the person;
 * **Commit** opens the removal pull request and, once it is merged, offers
 * the live step its answer names. cluster-manager's `notFound.nothingLeft`
 * answer, to a dry run or a call, reads as the removal complete.
 *
 * Every call in mode apply is a pass of the removal, shown with what it
 * removed, what is left and why, and what it waits for. After each pass the
 * dialog asks cluster-manager by a dry run whether another pass would remove
 * something new — while the uninstall runs a pass answers the same — and
 * offers **Finish removal** only then, checking again every
 * {@link REMOVAL_CHECK_INTERVAL_MS} while there is nothing new to do.
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
  const [passes, setPasses] = useState<RemovalPass[]>([]);
  /** A pass in flight: no check runs beside it. */
  const [passing, setPassing] = useState(false);
  /** The last dry run of the next pass, judged against the passes made. */
  const [nextCheck, setNextCheck] = useState<{
    next: NextPass;
    at: Date;
  }>();
  const [committed, setCommitted] = useState<ClusterWriteResult>();
  const input: DeleteClusterInput = { organization, name };
  const startAnswer = useOpenGeneration(isOpen);
  // A Delete without the name typed says so on the field and focuses it, as
  // the app's other typed confirmations do (the `forms` skill).
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope, { isOpen });
  const typedError =
    // A pasted name often carries a trailing space or newline.
    typed.trim() === name ? undefined : `Type ${name} to confirm the deletion.`;

  /** The dry runs, again after a refusal the person has dealt with. */
  const check = async () => {
    setVerdicts(undefined);
    const isCurrent = startAnswer();
    const judged = await judgeModes(
      dryRunMode => write.remove(input, { mode: dryRunMode, dryRun: true }),
      commitOffered,
    );
    if (!isCurrent()) {
      return;
    }
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
      setPasses([]);
      setNextCheck(undefined);
      setCommitted(undefined);
      write.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, installation, organization, name]);

  /** Delete, Continue after a partial answer, Finish removal and the live step after a merge: the same call. */
  const onPass = async (label: string) => {
    setNextCheck(undefined);
    setPassing(true);
    try {
      const result = await write.remove(input, { mode: 'apply' });
      setPasses(previous => [...previous, { label, result, at: new Date() }]);
    } catch {
      // Shown from `write.failure`.
    } finally {
      setPassing(false);
    }
  };

  const onCommit = async () => {
    try {
      setCommitted(await write.remove(input, { mode: 'commit' }));
    } catch {
      // Shown from `write.failure`.
    }
  };

  /** Delete or Commit, once the name is typed. */
  const onConfirm = () => {
    if (typedError) {
      validation.reveal();
      return;
    }
    if (mode === 'commit') {
      onCommit();
    } else {
      onPass('Delete');
    }
  };

  const checking = isOpen && !verdicts;
  const last = passes.at(-1);
  const removed = last?.result;
  const started = Boolean(removed || committed);
  const notConnected =
    write.failure?.kind === 'not-connected'
      ? write.failure
      : notConnectedOf(verdicts);
  const nothingLeft = nothingLeftOf(verdicts) || isNothingLeft(write.failure);
  const preview = nothingLeft ? undefined : previewOf(verdicts);
  const refusedEverywhere =
    Boolean(verdicts) && !preview && !notConnected && !nothingLeft;
  /** After a pass that was not cut short: what the next one would do. */
  const afterPass = Boolean(removed && !removed.partial && !nothingLeft);
  const watching =
    isOpen &&
    afterPass &&
    !passing &&
    !write.failure &&
    nextCheck?.next.state !== 'ready';

  useEffect(() => {
    if (!watching) {
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const isCurrent = startAnswer();
      let result: ClusterWriteResult;
      try {
        result = await write.remove(input, { mode: 'apply', dryRun: true });
      } catch {
        // Shown from `write.failure`; nothing left reads as the removal complete.
        return;
      }
      if (cancelled || !isCurrent()) {
        return;
      }
      const next = judgeNextPass(result, passes);
      setNextCheck({ next, at: new Date() });
      if (next.state !== 'ready') {
        timer = setTimeout(run, REMOVAL_CHECK_INTERVAL_MS);
      }
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, passes]);

  const finishButton = (
    <div>
      <Button
        variant="secondary"
        size="small"
        onPress={() => onPass('Finish removal')}
        isDisabled={write.isBusy}
      >
        {write.isWriting ? 'Removing…' : 'Finish removal'}
      </Button>
    </div>
  );

  return (
    <BusyDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isBusy={write.isWriting}
      width="min(90vw, 720px)"
    >
      {close => (
        <>
          <DialogHeader>Delete cluster {name}?</DialogHeader>
          <DialogBody>
            <Flex direction="column" gap="3" ref={scope}>
              <Text variant="body-medium">
                Removes {name} from {installation} as you, through
                cluster-manager: helm-controller uninstalls the cluster and its
                default apps, and what cluster-manager created on it goes with
                it.
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
                      {[
                        modeBlocker(verdicts.apply),
                        modeBlocker(verdicts.commit),
                      ]
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
                    {...validation.textFieldProps('typed', typedError)}
                  />
                </>
              )}

              {write.failure &&
                write.failure.kind !== 'not-connected' &&
                !nothingLeft && (
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
              {passes.map((pass, index) =>
                index === passes.length - 1 && pass.result.partial ? (
                  <PartialWriteOutcome
                    key={index}
                    result={pass.result}
                    action={pass.label}
                    onContinue={() => onPass('Continue')}
                    isBusy={write.isBusy}
                  />
                ) : (
                  <PassOutcome
                    key={index}
                    passes={passes}
                    index={index}
                    // An earlier pass's next step is superseded by the later
                    // pass, and every one by the removal complete.
                    current={index === passes.length - 1 && !nothingLeft}
                  />
                ),
              )}
              {afterPass && !passing && (
                <Flex direction="column" gap="2" data-testid="removal-next">
                  {write.failure && finishButton}
                  {!write.failure && !nextCheck && (
                    <Text variant="body-small" color="secondary">
                      Checking what is left to remove…
                    </Text>
                  )}
                  {!write.failure && nextCheck && (
                    <NextPassOutcome
                      next={nextCheck.next}
                      at={nextCheck.at}
                      last={last!.result}
                      finishButton={finishButton}
                    />
                  )}
                </Flex>
              )}
              {nothingLeft && (
                <Alert
                  status="success"
                  data-testid="delete-complete"
                  title={
                    started
                      ? `${name} is removed: nothing of it is left`
                      : `${name} is already removed: nothing of it is left`
                  }
                />
              )}
              {committed?.commit && (
                <ClusterManagerCommitOutcome
                  commit={committed.commit}
                  liveStep={
                    !removed &&
                    !nothingLeft && (
                      <Button
                        variant="secondary"
                        size="small"
                        onPress={() => onPass('Live step')}
                        isDisabled={write.isBusy}
                      >
                        {write.isBusy
                          ? 'Running…'
                          : 'Merged: run the live step'}
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
                onPress={close}
                isDisabled={write.isWriting}
              >
                {started || nothingLeft ? 'Close' : 'Cancel'}
              </Button>
              {!started && !nothingLeft && (
                <Button
                  variant="primary"
                  destructive
                  onPress={onConfirm}
                  // Waits only for the dry run's answer and the call in flight;
                  // a missing name is said on the field instead.
                  isDisabled={!preview || !mode || write.isBusy}
                >
                  {deleteLabel(mode, write.isBusy)}
                </Button>
              )}
            </Flex>
          </DialogFooter>
        </>
      )}
    </BusyDialog>
  );
}

/**
 * One pass of the removal: what it removed, what an earlier pass's delete is
 * still removing, what is left and why, and what it waits for — or, when it
 * removed nothing new, that nothing more could be removed yet.
 */
function PassOutcome({
  passes,
  index,
  current,
}: {
  passes: RemovalPass[];
  index: number;
  /** The last pass, the removal not complete: what it waits for still holds. */
  current: boolean;
}) {
  const { label, result, at } = passes[index];
  const { removed, stillGoing } = summarizePass(passes, index);
  let title = `Removed as you: ${countNoun(removed.length, 'object')}`;
  if (removed.length === 0) {
    title =
      index === 0
        ? 'Nothing could be removed yet'
        : 'Nothing more could be removed yet';
  }
  return (
    <Alert
      status={removed.length > 0 ? 'success' : 'info'}
      data-testid="delete-pass"
      title={title}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small" color="secondary">
            {label}, {formatClock(at)}
          </Text>
          {removed.length > 0 && (
            <Text variant="body-small" color="secondary">
              {removed.map(describeObject).join(' · ')}
            </Text>
          )}
          {stillGoing.length > 0 && (
            <Text variant="body-small">
              Still being removed: {describeObjects(stillGoing)}.
            </Text>
          )}
          {(result.warnings ?? []).map(warning => (
            <Text key={warning} variant="body-small">
              {warning}
            </Text>
          ))}
          {current && result.nextStep && (
            <Text variant="body-small">{result.nextStep}</Text>
          )}
        </Flex>
      }
    />
  );
}

/**
 * What the dry run after the last pass says: Finish removal once another pass
 * removes something new, else what the removal waits for, said once.
 */
function NextPassOutcome({
  next,
  at,
  last,
  finishButton,
}: {
  next: NextPass;
  at: Date;
  last: ClusterWriteResult;
  finishButton: ReactNode;
}) {
  if (next.state === 'ready') {
    return (
      <>
        <Text variant="body-small">
          {countNoun(next.objects.length, 'object')}{' '}
          {next.objects.length === 1 ? 'is' : 'are'} left to remove now:{' '}
          {describeObjects(next.objects)}.
        </Text>
        {finishButton}
      </>
    );
  }
  const checked = (
    <Text variant="body-small" color="secondary">
      Checked at {formatClock(at)}. The dialog checks again every{' '}
      {REMOVAL_CHECK_INTERVAL_MS / 1000} seconds and offers Finish removal once
      there is more to remove.
    </Text>
  );
  if (next.state === 'waiting') {
    return (
      <>
        {next.reason !== last.nextStep && (
          <Text variant="body-small">{next.reason}</Text>
        )}
        {checked}
      </>
    );
  }
  const known = last.warnings ?? [];
  return (
    <>
      <Text variant="body-small">
        What is left is not cluster-manager's to remove.
      </Text>
      {next.warnings
        .filter(warning => !known.includes(warning))
        .map(warning => (
          <Text key={warning} variant="body-small">
            {warning}
          </Text>
        ))}
      {checked}
    </>
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
