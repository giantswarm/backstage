import { Flex, Text } from '@backstage/ui';
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard, StatusLabel } from '@giantswarm/backstage-plugin-ui-react';
import {
  getBuildFailingChecksFromEntity,
  getBuildStatusCheckedFromEntity,
  getBuildStatusFromEntity,
  getBuildToolchainFromEntity,
  getChartMetadataStyleFromEntity,
  getDefaultBranchFromEntity,
  getReadinessAdvisoryFromEntity,
  getReadinessCheckedFromEntity,
  getReadinessFlagsFromEntity,
  getReadinessFromEntity,
  getReadinessStandardsFromEntity,
} from '../../utils/entity';
import {
  BUILD_STATUS_MEANINGS,
  buildStatusIntent,
  buildStatusLabel,
} from '../../utils/build';
import {
  READINESS_MEANINGS,
  STANDARDS_INTENTS,
  STANDARDS_LABELS,
  partitionReadinessFlags,
  readinessIntent,
  readinessLabel,
} from '../../utils/readiness';
import { AboutField, DateComponent } from '../../UI';

/**
 * What each flag means, in the reader's terms rather than the checker's. A bare
 * flag name tells somebody their app is wrong without telling them what to do.
 */
const FLAG_EXPLANATIONS: Record<string, string> = {
  'RELEASE-NOT-PUBLISHED':
    'The newest release exists in git but that chart version is not in the registry, so a HelmRelease has nothing to point at.',
  'NEVER-PUBLISHED':
    'The chart registry holds no stable version of this chart at all — only dev builds from branches.',
  'BUILD-RED':
    'The default branch does not build: a check confirmed to have run on that branch is failing. Until it is green, no new release can be produced.',
  'META-NO-TEAM':
    'Chart.yaml has no team annotation under either prefix. app-build-suite fails the build on this (C0001).',
  'NO-VALUES-SCHEMA':
    'No helm/<chart>/values.schema.json. app-build-suite fails the build on this (F0001).',
  'META-LEGACY':
    'Annotations still use the replaced application.giantswarm.io/ prefix instead of io.giantswarm.application.',
  'META-NO-AUDIENCE': 'Chart.yaml has no audience annotation.',
  'META-NO-MANAGED': 'Chart.yaml has no managed annotation.',
  'CHART-API-V1': 'Chart.yaml apiVersion is not v2.',
  'CHART-NO-DESCRIPTION': 'Chart.yaml has no description.',
  'CHART-NO-KEYWORDS': 'Chart.yaml has no keywords.',
  'CHART-NO-HOME': 'Chart.yaml has no home field.',
  'HOME-NOT-GS':
    'Chart.yaml home does not point at a Giant Swarm repository. Charts vendored from upstream often keep the upstream URL.',
};

function FlagList(props: { flags: string[]; enforced: boolean }) {
  const { flags, enforced } = props;

  return (
    <Flex direction="column" gap="2">
      {flags.map(flag => (
        <Flex key={flag} direction="column" gap="1">
          <StatusLabel
            label={flag}
            intent={enforced ? 'negative' : 'neutral'}
          />
          {FLAG_EXPLANATIONS[flag] && (
            <Text variant="body-medium">{FLAG_EXPLANATIONS[flag]}</Text>
          )}
        </Flex>
      ))}
    </Flex>
  );
}

/**
 * Shows whether this component can be released, and what stands in the way.
 *
 * The card's job is to keep three different claims apart.
 *
 * The release verdict answers "did the newest release reach the registry".
 * The chart-metadata verdict answers "does this chart build", and is a separate
 * label written by the catalog importer — a component can perfectly well be
 * releasable *and* carry a metadata gap, so the two get their own status and
 * their own list rather than one merged "Blocking" claim. Both write to
 * `giantswarm.io/readiness-flags`, which is why the list is split back apart by
 * the verdict that owns each flag.
 *
 * Advisory gaps are the third: documented in the chart metadata standard and
 * gated nowhere — four charts in five carry at least one — so they are labelled
 * as not enforced and shown neutrally. Showing them as failures would turn a
 * rollout nobody has run into hundreds of broken apps.
 *
 * The build is the fourth, and its own section. "Does the default branch build
 * right now" is neither of the above: the release that exists may be in the
 * registry and the chart fully compliant while main is red for an unrelated
 * reason. Next to the verdict sits the toolchain the branch declares — orb,
 * app-build-suite, app-test-suite — worded as declared, not as executed,
 * because it is read from the config, not from the last build.
 */
export function EntityAppReadinessCard() {
  const { entity } = useEntity();

  const readiness = getReadinessFromEntity(entity);
  const standards = getReadinessStandardsFromEntity(entity);
  const {
    release: releaseFlags,
    build: buildFlags,
    chartMetadata: metadataFlags,
  } = partitionReadinessFlags(getReadinessFlagsFromEntity(entity));
  const buildStatus = getBuildStatusFromEntity(entity);
  const failingChecks = getBuildFailingChecksFromEntity(entity);
  const buildChecked = getBuildStatusCheckedFromEntity(entity);
  const defaultBranch = getDefaultBranchFromEntity(entity);
  const toolchain = getBuildToolchainFromEntity(entity);
  const hasToolchain = Boolean(toolchain.orbVersion || toolchain.orbRef);
  // "the default branch" when the processor has not named it: the toolchain
  // comes from the importer and is present whether or not the processor runs.
  const branchName = defaultBranch ?? 'the default branch';
  const advisory = getReadinessAdvisoryFromEntity(entity);
  const checked = getReadinessCheckedFromEntity(entity);
  const metadataStyle = getChartMetadataStyleFromEntity(entity);

  return (
    // The card is shown wherever there is readiness data from either source, so
    // on an importer-only component it holds chart-metadata verdicts and
    // nothing about releases. Since AppReadinessProcessor ships disabled, that
    // is every component today — titling it "Release readiness" there would
    // name something the card does not contain.
    <InfoCard
      title={readiness || buildStatus ? 'Release readiness' : 'Readiness'}
    >
      <Flex direction="column" gap="5">
        <Flex gap="5" style={{ flexWrap: 'wrap' }}>
          {readiness && (
            <AboutField label="Status" value="">
              <StatusLabel
                label={readinessLabel(readiness)}
                intent={readinessIntent(readiness)}
                title={READINESS_MEANINGS[readiness]}
              />
            </AboutField>
          )}
          {standards && (
            <AboutField label="Chart metadata" value="">
              <StatusLabel
                label={STANDARDS_LABELS[standards] ?? standards}
                intent={STANDARDS_INTENTS[standards] ?? 'neutral'}
                title={
                  standards === 'incomplete'
                    ? 'A chart here carries a gap that fails a build today. Advisory gaps do not count towards this.'
                    : 'The charts pass everything that is actually enforced.'
                }
              />
            </AboutField>
          )}
          {metadataStyle && (
            <AboutField label="Chart metadata style" value={metadataStyle} />
          )}
          {checked && (
            <AboutField label="Checked" value="">
              <DateComponent value={checked} relative />
            </AboutField>
          )}
        </Flex>

        {readiness && (
          <Text variant="body-medium">{READINESS_MEANINGS[readiness]}</Text>
        )}

        {releaseFlags.length > 0 && (
          <Flex direction="column" gap="2">
            <Text variant="title-x-small">Blocking the release</Text>
            <FlagList flags={releaseFlags} enforced />
          </Flex>
        )}

        {(buildStatus || hasToolchain) && (
          <Flex direction="column" gap="2">
            <Text variant="title-x-small">Build</Text>
            <Flex gap="5" style={{ flexWrap: 'wrap' }}>
              {buildStatus && (
                <AboutField label={`Build on ${branchName}`} value="">
                  <StatusLabel
                    label={buildStatusLabel(buildStatus)}
                    intent={buildStatusIntent(buildStatus)}
                    title={BUILD_STATUS_MEANINGS[buildStatus]}
                  />
                </AboutField>
              )}
              {(toolchain.orbVersion || toolchain.orbRef) && (
                <AboutField
                  label="Architect orb"
                  value={
                    toolchain.orbVersion ??
                    `${toolchain.orbRef} (not a release)`
                  }
                />
              )}
              {toolchain.absVersion && (
                <AboutField
                  label="app-build-suite"
                  value={toolchain.absVersion}
                />
              )}
              {toolchain.atsVersion && (
                <AboutField
                  label="app-test-suite"
                  value={
                    toolchain.atsSource === 'repo'
                      ? `${toolchain.atsVersion} (repo override)`
                      : toolchain.atsVersion
                  }
                />
              )}
              {buildChecked && (
                <AboutField label="Checked" value="">
                  <DateComponent value={buildChecked} relative />
                </AboutField>
              )}
            </Flex>
            {buildStatus && (
              <Text variant="body-medium">
                {BUILD_STATUS_MEANINGS[buildStatus]}
              </Text>
            )}
            {failingChecks.length > 0 && (
              <Text variant="body-medium">
                Failing: {failingChecks.join(', ')}
              </Text>
            )}
            {hasToolchain && (
              <Text variant="body-medium">
                Toolchain as declared on {branchName}: the architect orb pinned
                in the CircleCI config, and the app-build-suite and
                app-test-suite versions that orb pins in turn. This is what the
                next build will use, not proof of what the last one ran.
              </Text>
            )}
            {buildFlags.length > 0 && <FlagList flags={buildFlags} enforced />}
          </Flex>
        )}

        {metadataFlags.length > 0 && (
          <Flex direction="column" gap="2">
            <Text variant="title-x-small">Fails a build today</Text>
            <Text variant="body-medium">
              Chart metadata gaps that app-build-suite rejects. They stop the
              next build of this chart, which is a different question from
              whether the release that already exists reached the registry.
            </Text>
            <FlagList flags={metadataFlags} enforced />
          </Flex>
        )}

        {advisory.length > 0 && (
          <Flex direction="column" gap="2">
            <Text variant="title-x-small">Not enforced</Text>
            <Text variant="body-medium">
              Documented in the chart metadata standard, but gated nowhere: no
              CI check and no admission policy. Most of these describe a rollout
              that has not happened rather than a problem with this chart.
            </Text>
            <FlagList flags={advisory} enforced={false} />
          </Flex>
        )}
      </Flex>
    </InfoCard>
  );
}
