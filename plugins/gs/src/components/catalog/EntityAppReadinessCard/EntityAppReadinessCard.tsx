import { Flex, Text } from '@backstage/ui';
import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard, StatusLabel } from '@giantswarm/backstage-plugin-ui-react';
import {
  getChartMetadataStyleFromEntity,
  getReadinessAdvisoryFromEntity,
  getReadinessCheckedFromEntity,
  getReadinessFlagsFromEntity,
  getReadinessFromEntity,
  getReadinessStandardsFromEntity,
} from '../../utils/entity';
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
 */
export function EntityAppReadinessCard() {
  const { entity } = useEntity();

  const readiness = getReadinessFromEntity(entity);
  const standards = getReadinessStandardsFromEntity(entity);
  const { release: releaseFlags, chartMetadata: metadataFlags } =
    partitionReadinessFlags(getReadinessFlagsFromEntity(entity));
  const advisory = getReadinessAdvisoryFromEntity(entity);
  const checked = getReadinessCheckedFromEntity(entity);
  const metadataStyle = getChartMetadataStyleFromEntity(entity);

  return (
    <InfoCard title="Release readiness">
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
