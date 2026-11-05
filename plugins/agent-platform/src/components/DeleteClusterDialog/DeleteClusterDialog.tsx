import { useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
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
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { useClusterWrite } from '../../hooks/useClusterManager';
import { useOpenGeneration } from '../../hooks/useOpenGeneration';
import {
  CLUSTER_MANAGER_SERVER,
  isNothingLeft,
  type ClusterWriteResult,
  type DeleteClusterInput,
  type ObjectAction,
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
import { NextPassOutcome } from './NextPassOutcome';
import { PassOutcome } from './PassOutcome';
import { mergeRemovalStates, readRemovalStates } from './beingRemoved';
import {
  REMOVAL_CHECK_INTERVAL_MS,
  REMOVAL_CHECK_LIMIT,
  describeObjects,
  judgeNextPass,
  objectKey,
  type NextPass,
  type RemovalPass,
  type RemovalStates,
} from './removalPasses';

/** The last dry run of the next pass, judged against the passes made. */
type NextCheck = {
  /** Absent when the check failed: its failure is shown from `write.failure`. */
  next?: NextPass;
  at: Date;
  /** No further check is scheduled: what is left is not cluster-manager's, or the round ran out. */
  paused: boolean;
};

const NO_STATES: RemovalStates = new Map();

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
 * {@link REMOVAL_CHECK_INTERVAL_MS} while there is nothing new to do — through
 * a failed check, for 30 minutes at most, and not once
 * what is left is not cluster-manager's to remove; **Check again** starts
 * another round.
 *
 * cluster-manager answers a delete of an object that is already terminating
 * like any other, so the dialog reads every object a dry run would delete as
 * the person, on the installation's API: one whose deletion was requested
 * already (its `deletionTimestamp`) shows as still being removed, and neither
 * counts as removed by the next pass nor brings back Finish removal — after
 * the dialog was reopened mid-removal too, when no pass of this opening
 * deleted it. An object that cannot be read counts as a new removal.
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
  const kubernetesApi = useApi(kubernetesApiRef);
  const [verdicts, setVerdicts] = useState<ModeVerdicts>();
  const [mode, setMode] = useState<WriteMode>();
  const [typed, setTyped] = useState('');
  const [passes, setPasses] = useState<RemovalPass[]>([]);
  /** A pass in flight: no check runs beside it. */
  const [passing, setPassing] = useState(false);
  /** The last pass in mode apply was refused: no check runs over its failure. */
  const [passFailed, setPassFailed] = useState(false);
  const [nextCheck, setNextCheck] = useState<NextCheck>();
  const [committed, setCommitted] = useState<ClusterWriteResult>();
  /**
   * What was read of the objects the dry runs of this opening would delete
   * (`beingRemoved.ts`), kept in a ref too: the check's effect and a pass
   * started while a read is out both need the latest.
   */
  const [states, setStates] = useState<RemovalStates>(NO_STATES);
  const statesRef = useRef<RemovalStates>(NO_STATES);
  const updateStates = (next: RemovalStates) => {
    statesRef.current = next;
    setStates(next);
  };
  /** The read after the opening dry run: a pass waits for it before writing. */
  const openingRead = useRef<Promise<void>>();
  /**
   * A round of reads failed in the Kubernetes proxy: no more reads until the
   * dialog is closed, so a proxy that is down is not asked again every check
   * (each failure is a proxy error in the backend's log). Objects not read
   * count as removals anew, as without the reads.
   */
  const readsStopped = useRef(false);
  /**
   * Reads the states of the objects, unless reads stopped; a failed round
   * stops them, if it still belongs to this opening (`isCurrent`).
   */
  const readStates = async (
    objects: readonly ObjectAction[],
    isCurrent: () => boolean,
  ): Promise<RemovalStates> => {
    if (readsStopped.current) {
      return NO_STATES;
    }
    const { states: read, failed } = await readRemovalStates(
      kubernetesApi,
      installation,
      objects,
      statesRef.current,
    );
    if (failed && isCurrent()) {
      readsStopped.current = true;
    }
    return read;
  };
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
    if (judged.apply.state === 'ready') {
      // The preview shows already; a pass pressed before the read answers
      // waits for it (onPass).
      const { objects } = judged.apply.result;
      const reading = readStates(objects, isCurrent).then(read => {
        if (isCurrent()) {
          updateStates(mergeRemovalStates(statesRef.current, objects, read));
        }
      });
      openingRead.current = reading;
      await reading;
    }
  };

  useEffect(() => {
    if (isOpen) {
      check();
    } else {
      setVerdicts(undefined);
      setMode(undefined);
      setTyped('');
      setPasses([]);
      setPassFailed(false);
      setNextCheck(undefined);
      setCommitted(undefined);
      updateStates(NO_STATES);
      openingRead.current = undefined;
      readsStopped.current = false;
      write.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, installation, organization, name]);

  /** Delete, Continue after a partial answer, Finish removal and the live step after a merge: the same call. */
  const onPass = async (label: string) => {
    setNextCheck(undefined);
    setPassFailed(false);
    setPassing(true);
    try {
      // The opening read must answer before the write: answered after, it
      // could see the pass's own delete. It gives up within its timeout.
      await openingRead.current;
      // What was read before the pass, which it is judged against.
      const before = statesRef.current;
      const result = await write.remove(input, { mode: 'apply' });
      setPasses(previous => [
        ...previous,
        { label, result, at: new Date(), states: before },
      ]);
    } catch {
      // Shown from `write.failure`.
      setPassFailed(true);
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

  /** A call on its way, or a pass waiting for the opening read. */
  const busy = write.isBusy || passing;
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
    !passFailed &&
    !nextCheck?.paused &&
    nextCheck?.next?.state !== 'ready';

  useEffect(() => {
    if (!watching) {
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checks = 0;
    const run = async () => {
      checks += 1;
      const isCurrent = startAnswer();
      let next: NextPass | undefined;
      let known: RemovalStates | undefined;
      try {
        const result = await write.remove(input, {
          mode: 'apply',
          dryRun: true,
        });
        // Only what is not known to be going: a read that fails keeps what
        // an earlier one found.
        const read = await readStates(result.objects, isCurrent);
        known = mergeRemovalStates(statesRef.current, result.objects, read);
        next = judgeNextPass(result, passes, known);
      } catch {
        // Shown from `write.failure` and tried again: a blip must not end the
        // watch. Nothing left reads as the removal complete and ends it.
      }
      if (cancelled || !isCurrent()) {
        return;
      }
      if (known) {
        updateStates(known);
      }
      const paused =
        next?.state === 'stuck' ||
        (next?.state !== 'ready' && checks >= REMOVAL_CHECK_LIMIT);
      setNextCheck({ next, at: new Date(), paused });
      if (next?.state !== 'ready' && !paused) {
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
        isDisabled={busy}
      >
        {write.isWriting || passing ? 'Removing…' : 'Finish removal'}
      </Button>
    </div>
  );

  return (
    <BusyDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      // A pass waiting for the opening read is on its way too.
      isBusy={write.isWriting || passing}
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

              {preview && !started && (
                <WhatGoes result={preview} states={states} />
              )}

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
                  // Signed in: the refusal is cleared, and dry runs that
                  // were refused ask again. A deletion never goes again by
                  // itself: the person presses Delete once more.
                  onSignedIn={() => {
                    write.reset();
                    if (notConnectedOf(verdicts)) {
                      void check();
                    }
                  }}
                />
              )}
              {passes.map((pass, index) =>
                index === passes.length - 1 && pass.result.partial ? (
                  <PartialWriteOutcome
                    key={index}
                    result={pass.result}
                    action={pass.label}
                    onContinue={() => onPass('Continue')}
                    isBusy={busy}
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
              {afterPass && (
                <Flex direction="column" gap="2" data-testid="removal-next">
                  {(passing || passFailed) && finishButton}
                  {!passing && !passFailed && !nextCheck && (
                    <Text variant="body-small" color="secondary">
                      Checking what is left to remove…
                    </Text>
                  )}
                  {!passing && !passFailed && nextCheck && (
                    <NextPassOutcome
                      next={nextCheck.next}
                      at={nextCheck.at}
                      paused={nextCheck.paused}
                      last={last!.result}
                      finishButton={finishButton}
                      onCheckAgain={() => setNextCheck(undefined)}
                      isBusy={write.isBusy}
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
                        isDisabled={busy}
                      >
                        {busy ? 'Running…' : 'Merged: run the live step'}
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
                  isDisabled={!preview || !mode || busy}
                >
                  {deleteLabel(mode, busy)}
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
 * The dry run's answer: the releases and models that go with the cluster, and
 * what is being removed already — the dialog reopened mid-removal.
 */
function WhatGoes({
  result,
  states,
}: {
  result: ClusterWriteResult;
  states: RemovalStates;
}) {
  const withCluster = result.withCluster ?? [];
  const models = result.models ?? [];
  // Read as terminating, whether or not a pass would still help it go.
  const terminating = (object: ObjectAction) =>
    (states.get(objectKey(object)) ?? 'live') !== 'live';
  const going = result.objects.filter(terminating);
  const rest = result.objects.filter(object => !terminating(object));
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
      {going.length > 0 && (
        <Text variant="body-small">
          Still being removed: {describeObjects(going)}.
        </Text>
      )}
      {rest.length > 0 && (
        <Text variant="body-small" color="secondary">
          {rest
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
