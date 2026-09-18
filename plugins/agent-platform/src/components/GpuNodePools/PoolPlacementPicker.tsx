import { Checkbox, CheckboxGroup, Flex, Switch, Text } from '@backstage/ui';

import {
  describeCacheClaim,
  type CacheClaim,
  type ManagedCluster,
  type NodePoolWriteResult,
  type Refusal,
} from '../../lib/clusterManager';

/** What this installation's `create_node_pool` takes of the two choices. */
export type PlacementOffer = {
  zones: boolean;
  cache: boolean;
};

export type PoolPlacementPickerProps = {
  /** The picked cluster: its node-subnet zones and, when they cannot be read, why. */
  cluster: ManagedCluster | undefined;
  offers: PlacementOffer;
  /** The zones chosen; empty lets the platform choose. */
  zones: string[];
  onZonesChange: (zones: string[]) => void;
  /** Whether the pool keeps a model cache. */
  cache: boolean;
  onCacheChange: (cache: boolean) => void;
  /** A write in flight: nothing changes until it answers. */
  isBusy: boolean;
};

/** The id of the zones picker. */
export const ZONES_PICKER_ID = 'gpu-node-pool-zones';

export const LET_PLATFORM_CHOOSE =
  'Let the platform choose — Karpenter searches every zone of the cluster for capacity.';

/** The cache's consequence, in one line each way (decisions of 2026-09-18 on the model cache). */
export const CACHE_ON_NOTE =
  "A cache claim per zone, about $27 a month at the platform's defaults: the download and the compile of every later start of the same model in that zone are saved.";
export const CACHE_OFF_NOTE =
  "Nothing stands: the weights land on the node's disk at every start, and a cold start costs about 90 s more.";

/** `eu-central-1a, eu-central-1c`, or the platform's choice when none is named. */
export function describeZonesChoice(zones: string[]): string {
  return zones.length === 0 ? 'let the platform choose' : zones.join(', ');
}

/**
 * **Zones** and **Model cache** on the Add GPU node pool form
 * (giantswarm/backstage#2483): where the pool's nodes may launch — any
 * combination of the cluster's node-subnet zones as `list_clusters` names
 * them, none chosen leaving the choice to the platform — and whether the
 * pool's serving slice keeps a model cache claim, each with its consequence
 * in one line. Offered only where the installation's `create_node_pool`
 * takes the argument (its schema); an older cluster-manager shows the form
 * as before. What cluster-manager makes of the choice — the pin, the claim
 * the slice mounts — is the dry run's `zonesNote` and `cache.note`, shown
 * in the review and, after Deploy, in the lifecycle panel.
 */
export function PoolPlacementPicker({
  cluster,
  offers,
  zones,
  onZonesChange,
  cache,
  onCacheChange,
  isBusy,
}: PoolPlacementPickerProps) {
  if (!offers.zones && !offers.cache) {
    return null;
  }
  const clusterZones = cluster?.zones;
  return (
    <Flex direction="column" gap="3" data-testid="pool-placement-picker">
      {offers.zones && clusterZones && clusterZones.length > 0 && (
        <Flex
          direction="column"
          gap="1"
          id={ZONES_PICKER_ID}
          data-testid="zones-picker"
        >
          <CheckboxGroup
            label="Zones"
            description="Where the pool's nodes may launch: any combination of the cluster's zones. A zone the person names is a capacity risk taken knowingly; with the model cache on, the pool follows its cache once a claim is bound."
            value={zones}
            onChange={onZonesChange}
            isDisabled={isBusy}
          >
            {clusterZones.map(zone => (
              <Checkbox key={zone} value={zone}>
                {zone}
              </Checkbox>
            ))}
          </CheckboxGroup>
          <Text
            variant="body-small"
            color="secondary"
            data-testid="zones-choice"
          >
            {zones.length === 0
              ? LET_PLATFORM_CHOOSE
              : `The nodes launch in ${zones.join(', ')} only.`}
          </Text>
        </Flex>
      )}
      {offers.zones && clusterZones && clusterZones.length === 0 && (
        <Text variant="body-small" color="secondary" data-testid="zones-note">
          Zones: the platform chooses —{' '}
          {cluster?.zonesNote ?? 'the cluster names no node subnet zones'}.
        </Text>
      )}
      {offers.cache && (
        <Flex direction="column" gap="1" data-testid="cache-picker">
          <Switch
            label="Keep a model cache"
            isSelected={cache}
            onChange={onCacheChange}
            isDisabled={isBusy}
          />
          <Text
            variant="body-small"
            color="secondary"
            data-testid="cache-consequence"
          >
            {cache ? CACHE_ON_NOTE : CACHE_OFF_NOTE}
          </Text>
        </Flex>
      )}
    </Flex>
  );
}

export type PoolPlacementReviewProps = {
  offers: PlacementOffer;
  zones: string[];
  cache: boolean;
  /** The dry run for the form as it stands: what cluster-manager makes of the choice. */
  review: NodePoolWriteResult;
};

/**
 * The review's word on the two choices: the zones and the cache as chosen,
 * and what cluster-manager answered for them in the dry run — the pin
 * (`zonesNote`) and the claim the slice mounts (`cache.note`) — so what
 * Deploy would write is read before it is written.
 */
export function PoolPlacementReview({
  offers,
  zones,
  cache,
  review,
}: PoolPlacementReviewProps) {
  if (!offers.zones && !offers.cache) {
    return null;
  }
  return (
    <Flex direction="column" gap="1" data-testid="placement-review">
      {offers.zones && (
        <Text variant="body-small">
          Zones: {describeZonesChoice(zones)}
          {review.zones && review.zones.length > 0
            ? ` — pinned to ${review.zones.join(', ')}.`
            : '.'}
        </Text>
      )}
      {review.zonesNote && (
        <Text
          variant="body-x-small"
          color="secondary"
          data-testid="review-zones-note"
        >
          {review.zonesNote}
        </Text>
      )}
      {offers.cache && (
        <Text variant="body-small">
          Model cache: {cache ? 'on' : 'off'} —{' '}
          {cache ? CACHE_ON_NOTE : CACHE_OFF_NOTE}
        </Text>
      )}
      {review.cache?.note && (
        <Text
          variant="body-x-small"
          color="secondary"
          data-testid="review-cache-note"
        >
          {review.cache.note}
        </Text>
      )}
    </Flex>
  );
}

/** The claims a cache refusal names, and its remedies; nothing for a refusal without a cache block. */
export function cacheRefusalDetails(
  refused: Refusal | undefined,
): { claims: CacheClaim[]; remedies: string[] } | undefined {
  if (refused?.cacheZone) {
    return {
      claims: refused.cacheZone.claim ? [refused.cacheZone.claim] : [],
      remedies: refused.cacheZone.remedies,
    };
  }
  if (refused?.cacheClaims) {
    return refused.cacheClaims;
  }
  return undefined;
}

/**
 * A `create_node_pool` refusal about the zones and the model cache, from its
 * structured block: the claims at fault with where each stands, and the ways
 * out cluster-manager names — rendered, nothing parsed from prose.
 */
export function CacheRefusalDetails({ refused }: { refused: Refusal }) {
  const details = cacheRefusalDetails(refused);
  if (!details) {
    return null;
  }
  return (
    <Flex direction="column" gap="1" data-testid="refused-cache">
      {details.claims.map(claim => (
        <Text
          key={`${claim.namespace}/${claim.name}`}
          variant="body-small"
          style={{ overflowWrap: 'anywhere' }}
        >
          Claim {describeCacheClaim(claim)}
          {claim.volume ? `, volume ${claim.volume}` : ''}
        </Text>
      ))}
      {details.remedies.length > 0 && (
        <Text variant="body-small">Ways out:</Text>
      )}
      {details.remedies.map(remedy => (
        <Text key={remedy} variant="body-small">
          · {remedy}
        </Text>
      ))}
      {refused.hint && (
        <Text variant="body-small" color="secondary">
          {refused.hint}
        </Text>
      )}
    </Flex>
  );
}
