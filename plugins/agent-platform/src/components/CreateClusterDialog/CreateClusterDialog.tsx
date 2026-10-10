import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  Select,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';
import { load } from 'js-yaml';
import {
  AWSClusterRoleIdentity,
  Organization,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { dialogDismissLock } from '@giantswarm/backstage-plugin-ui-react';

import {
  useClusterManagerInfo,
  useClusterReleases,
  useClusterWrite,
  useManagedClusters,
} from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_SERVER,
  CLUSTER_MANAGER_TOOLS,
  isValidClusterName,
  offersCommit,
  type ClusterRelease,
  type ClusterWriteResult,
  type CreateClusterInput,
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
import { useOpenGeneration } from '../../hooks/useOpenGeneration';
import { ClusterManagerCommitOutcome } from '../ClusterManagerCommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { DIALOG_FORM_STYLE } from '../dialogForm';
import { ManifestList } from '../ManifestList';
import { PartialWriteOutcome } from '../GpuNodePools/PartialWriteOutcome';

/** The providers whose cloud identity is an `AWSClusterRoleIdentity`. */
const AWS_IDENTITY_PROVIDERS = ['aws', 'eks'];

/** The identity choice that leaves it to the chart. */
const CHART_DEFAULT = '';
const CHART_DEFAULT_KEY = 'chart-default';

export type CreateClusterDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The installations whose cluster-manager offers `create_cluster`. */
  installations: string[];
};

/** The release preselected: the newest one `create_cluster` offers on the line. */
export function defaultRelease(
  releases: ClusterRelease[],
  provider: string | undefined,
): string | undefined {
  return releases.find(
    release => release.provider === provider && release.offered,
  )?.version;
}

/** Why the name cannot be used, checked while typing; `undefined` when it can. */
export function clusterNameProblem(
  name: string,
  taken: string[],
): string | undefined {
  if (!name) {
    return undefined;
  }
  if (!isValidClusterName(name)) {
    return 'A lowercase DNS label of at most 20 characters, starting with a letter: letters, digits and dashes.';
  }
  return taken.includes(name)
    ? `A cluster named ${name} already exists on this installation.`
    : undefined;
}

/** The values editor's YAML as the object `create_cluster` takes, or why it is not one. */
export function parseValues(text: string): {
  values?: Record<string, unknown>;
  problem?: string;
} {
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = load(text);
    if (parsed === null || parsed === undefined) {
      return {};
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { problem: 'Values are a YAML mapping (key: value).' };
    }
    return { values: parsed as Record<string, unknown> };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

/**
 * Create cluster — cluster-manager's `create_cluster` through muster as the
 * signed-in person. The form offers what the installation's cluster-manager
 * names (`list_releases`: the provider lines, the releases a cluster may run,
 * the newest preselected) and checks the name while typing; the review shows
 * both modes' dry runs — the manifests, the values checked against the release
 * chart's schema, the pull request's files — and offers **Commit** (the pull
 * request as the person, preselected where git owns the organization) and
 * **Deploy** (the objects applied as the person), each disabled with
 * cluster-manager's reason where its dry run refused.
 */
export function CreateClusterDialog({
  isOpen,
  onOpenChange,
  installations,
}: CreateClusterDialogProps) {
  const [installation, setInstallation] = useState<string>();
  const [provider, setProvider] = useState<string>();
  const [release, setRelease] = useState<string>();
  const [organization, setOrganization] = useState<string>();
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState(CHART_DEFAULT);
  const [description, setDescription] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [verdicts, setVerdicts] = useState<ModeVerdicts>();
  const [mode, setMode] = useState<WriteMode>();
  const [judging, setJudging] = useState(false);
  const [applied, setApplied] = useState<ClusterWriteResult>();
  const [committed, setCommitted] = useState<ClusterWriteResult>();

  const target = installation ?? installations[0];
  const { info } = useClusterManagerInfo(target);
  const releases = useClusterReleases(target);
  const clusters = useManagedClusters(target);
  const write = useClusterWrite(target);
  const startAnswer = useOpenGeneration(isOpen);
  const organizations = useResources(target ?? [], Organization, undefined, {
    enabled: Boolean(target) && isOpen,
  });
  // The provider line in effect: the person's choice, else the first line
  // `list_releases` offers, which the form shows preselected.
  const line = provider ?? releases.providers[0];
  const awsIdentity = AWS_IDENTITY_PROVIDERS.includes(line ?? '');
  const identities = useResources(
    target ?? [],
    AWSClusterRoleIdentity,
    undefined,
    { enabled: Boolean(target) && isOpen && awsIdentity },
  );

  const chosenRelease = release ?? defaultRelease(releases.releases, line);
  const lineReleases = releases.releases.filter(
    candidate => candidate.provider === line,
  );
  const organizationNames = useMemo(
    () => organizations.resources.map(org => org.getName()).sort(),
    [organizations.resources],
  );
  const identityNames = useMemo(
    () => identities.resources.map(id => id.getName()).sort(),
    [identities.resources],
  );
  const nameProblem = clusterNameProblem(
    name,
    clusters.clusters.map(cluster => cluster.name),
  );
  const parsedValues = parseValues(valuesText);

  useEffect(() => {
    if (!isOpen) {
      setInstallation(undefined);
      setProvider(undefined);
      setRelease(undefined);
      setOrganization(undefined);
      setName('');
      setIdentity(CHART_DEFAULT);
      setDescription('');
      setValuesText('');
      setVerdicts(undefined);
      setJudging(false);
      setMode(undefined);
      setApplied(undefined);
      setCommitted(undefined);
      write.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const input: CreateClusterInput | undefined =
    target &&
    line &&
    organization &&
    name &&
    !nameProblem &&
    !parsedValues.problem
      ? {
          organization,
          name,
          provider: line,
          release: chosenRelease,
          identity: identity.trim() || undefined,
          description: description.trim() || undefined,
          values: parsedValues.values,
        }
      : undefined;

  const onReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!input || judging) {
      return;
    }
    setJudging(true);
    const isCurrent = startAnswer();
    try {
      const judged = await judgeModes(
        dryRunMode => write.create(input, { mode: dryRunMode, dryRun: true }),
        offersCommit(info, CLUSTER_MANAGER_TOOLS.createCluster),
      );
      if (!isCurrent()) {
        return;
      }
      write.reset();
      setVerdicts(judged);
      setMode(preferredMode(judged));
    } finally {
      if (isCurrent()) {
        setJudging(false);
      }
    }
  };

  /** Deploy or Commit, and Continue after a partial Deploy: the same call. */
  const onWrite = async () => {
    if (!input || !mode) {
      return;
    }
    try {
      const result = await write.create(input, { mode });
      if (mode === 'commit') {
        setCommitted(result);
      } else {
        setApplied(result);
      }
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onForm = !verdicts;
  const done = Boolean((applied && !applied.partial) || committed);
  const notConnected =
    write.failure?.kind === 'not-connected'
      ? write.failure
      : notConnectedOf(verdicts);
  const review = previewOf(verdicts);
  const commitReview =
    verdicts?.commit.state === 'ready'
      ? verdicts.commit.result.commit
      : undefined;
  const busy = write.isBusy || judging;

  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(write.isWriting, onOpenChange)}
      width="min(90vw, 860px)"
    >
      <form onSubmit={onReview} style={DIALOG_FORM_STYLE}>
        <DialogHeader>Create cluster</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              A workload cluster on the installation, composed by
              cluster-manager and written as you: applied on the installation,
              or as a pull request in the repository that owns the organization.
            </Text>

            {onForm && (
              <Flex direction="column" gap="3">
                {installations.length > 1 && (
                  <Select
                    label="Installation"
                    isRequired
                    options={installations.map(id => ({ id, label: id }))}
                    selectedKey={target ?? null}
                    onSelectionChange={key => {
                      if (key) {
                        setInstallation(String(key));
                        setProvider(undefined);
                        setRelease(undefined);
                        setOrganization(undefined);
                        setIdentity(CHART_DEFAULT);
                      }
                    }}
                  />
                )}
                {releases.error && (
                  <Alert
                    status="warning"
                    title="Releases could not be read"
                    description={releases.error.message}
                  />
                )}
                <Flex gap="3">
                  <Select
                    label="Provider"
                    isRequired
                    placeholder={
                      releases.isLoading ? 'Reading releases…' : 'No provider'
                    }
                    options={releases.providers.map(id => ({ id, label: id }))}
                    selectedKey={line ?? null}
                    onSelectionChange={key => {
                      if (key) {
                        setProvider(String(key));
                        setRelease(undefined);
                        setIdentity(CHART_DEFAULT);
                      }
                    }}
                  />
                  <Select
                    label="Release"
                    isRequired
                    placeholder={
                      releases.isLoading ? 'Reading releases…' : 'No release'
                    }
                    options={lineReleases.map(candidate => ({
                      id: candidate.version,
                      label: releaseLabel(candidate),
                      disabled: !candidate.offered,
                    }))}
                    selectedKey={chosenRelease ?? null}
                    onSelectionChange={key => key && setRelease(String(key))}
                  />
                </Flex>
                <Select
                  label="Organization"
                  isRequired
                  description="The cluster lives in the organization's namespace, org-<organization>."
                  placeholder={organizationPlaceholder(
                    organizations.isLoading,
                    organizationNames.length,
                  )}
                  options={organizationNames.map(id => ({ id, label: id }))}
                  selectedKey={organization ?? null}
                  onSelectionChange={key =>
                    setOrganization(key ? String(key) : undefined)
                  }
                />
                <TextField
                  label="Name"
                  isRequired
                  description={
                    nameProblem ??
                    "Prefixes the cluster's cloud resources and cannot change."
                  }
                  value={name}
                  onChange={setName}
                  isInvalid={Boolean(nameProblem)}
                />
                {awsIdentity ? (
                  <Select
                    label="Cloud identity"
                    description="The AWSClusterRoleIdentity the cluster runs under; no credential passes through the portal."
                    options={[
                      { id: CHART_DEFAULT_KEY, label: "The chart's default" },
                      ...identityNames.map(id => ({ id, label: id })),
                    ]}
                    selectedKey={identity || CHART_DEFAULT_KEY}
                    onSelectionChange={key =>
                      setIdentity(
                        !key || key === CHART_DEFAULT_KEY
                          ? CHART_DEFAULT
                          : String(key),
                      )
                    }
                  />
                ) : (
                  <TextField
                    label="Cloud identity"
                    description="The name of the provider's identity object the cluster runs under; empty for the chart's default."
                    value={identity}
                    onChange={setIdentity}
                  />
                )}
                <TextField
                  label="Description"
                  description="A sentence on the cluster's purpose."
                  value={description}
                  onChange={setDescription}
                />
                <TextAreaField
                  label="Values"
                  description={
                    parsedValues.problem ??
                    "Further values as YAML (global.controlPlane, global.nodePools, …), checked against the release chart's schema in the review."
                  }
                  value={valuesText}
                  onChange={setValuesText}
                  isInvalid={Boolean(parsedValues.problem)}
                />
              </Flex>
            )}

            {!onForm && (
              <Flex direction="column" gap="3" data-testid="cluster-review">
                {review && (
                  <>
                    <Text variant="body-medium">
                      {review.cluster} in {review.namespace}: release{' '}
                      {review.release ?? chosenRelease ?? '?'}
                      {review.kubernetesVersion
                        ? `, Kubernetes ${review.kubernetesVersion}`
                        : ''}
                      .
                    </Text>
                    <Text variant="body-small" color="secondary">
                      {review.objects
                        .map(
                          object =>
                            `${object.kind} ${object.namespace}/${object.name}: ${object.action}`,
                        )
                        .join(' · ')}
                    </Text>
                  </>
                )}
                <RadioGroup
                  label="How"
                  value={mode ?? null}
                  onChange={value => setMode(value as WriteMode)}
                  isDisabled={busy || done}
                >
                  <Radio
                    value="commit"
                    isDisabled={verdicts.commit.state !== 'ready'}
                  >
                    Commit — a pull request as you in the repository that owns
                    the organization
                  </Radio>
                  <Radio
                    value="apply"
                    isDisabled={verdicts.apply.state !== 'ready'}
                  >
                    Deploy — apply the objects on the installation as you
                  </Radio>
                </RadioGroup>
                <ModeNotes verdicts={verdicts} />
                {commitReview && (
                  <Text variant="body-small" color="secondary">
                    The pull request adds{' '}
                    {commitReview.files.map(file => file.path).join(', ')} to{' '}
                    {commitReview.repository} on {commitReview.base}.
                  </Text>
                )}
                {review?.manifests && review.manifests.length > 0 && (
                  <ManifestList manifests={review.manifests} />
                )}
              </Flex>
            )}

            {write.failure && write.failure.kind !== 'not-connected' && (
              <Alert
                status="danger"
                title="cluster-manager refused"
                description={write.failure.message}
              />
            )}
            {notConnected && target && (
              <ConnectAgentManagerAlert
                installation={target}
                message={notConnected.message}
                action="Clusters are created"
                server={CLUSTER_MANAGER_SERVER}
              />
            )}
            {applied?.partial && (
              <PartialWriteOutcome
                result={applied}
                action="Deploy"
                onContinue={onWrite}
                isBusy={write.isBusy}
              />
            )}
            {applied && !applied.partial && (
              <Alert
                status="success"
                title={`Cluster ${applied.cluster} applied as you`}
                description="helm-controller installs it now; the Clusters list shows it as it comes up."
              />
            )}
            {committed?.commit && (
              <ClusterManagerCommitOutcome commit={committed.commit} />
            )}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Flex gap="2" justify="end">
            <Button
              variant="secondary"
              onPress={() => onOpenChange(false)}
              isDisabled={write.isWriting}
            >
              {done ? 'Close' : 'Cancel'}
            </Button>
            {onForm && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={!input || judging}
              >
                {judging ? 'Checking…' : 'Review'}
              </Button>
            )}
            {!onForm && !done && (
              <>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setVerdicts(undefined);
                    write.reset();
                  }}
                  isDisabled={busy}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  onPress={onWrite}
                  isDisabled={!mode || busy || Boolean(applied?.partial)}
                >
                  {writeLabel(mode, write.isBusy)}
                </Button>
              </>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** What each mode's dry run said where it is not the plain choice. */
function ModeNotes({ verdicts }: { verdicts: ModeVerdicts }) {
  const commitBlocked = modeBlocker(verdicts.commit);
  const applyBlocked = modeBlocker(verdicts.apply);
  return (
    <Flex direction="column" gap="1" data-testid="mode-notes">
      {commitBlocked && (
        <Text variant="body-small" color="secondary">
          Commit is not possible: {commitBlocked}
        </Text>
      )}
      {!commitBlocked && !applyBlocked && (
        <Text variant="body-small" color="secondary">
          Git owns this organization: Deploy creates a cluster the repository
          does not know about.
        </Text>
      )}
      {applyBlocked && (
        <Text variant="body-small" color="secondary">
          Deploy is not possible: {applyBlocked}
        </Text>
      )}
    </Flex>
  );
}

/** The organization picker's placeholder: reading, nothing to pick, or pick one. */
function organizationPlaceholder(loading: boolean, count: number): string {
  if (loading) {
    return 'Reading organizations…';
  }
  return count === 0 ? 'No organization you can see' : 'Pick an organization';
}

function releaseLabel(release: ClusterRelease): string {
  const parts = [release.version];
  if (release.kubernetesVersion) {
    parts.push(`Kubernetes ${release.kubernetesVersion}`);
  }
  if (release.state !== 'active') {
    parts.push(release.state);
  }
  if (!release.offered && release.note) {
    parts.push(release.note);
  }
  return parts.join(' · ');
}

function writeLabel(mode: WriteMode | undefined, busy: boolean): string {
  if (mode === 'commit') {
    return busy ? 'Committing…' : 'Commit';
  }
  return busy ? 'Deploying…' : 'Deploy';
}
