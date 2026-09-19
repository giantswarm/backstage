import { Checkbox, CheckboxGroup, Flex, Switch, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import {
  cacheKeptByCluster,
  describeCacheClaim,
  describeCacheSetting,
  describeClaimSize,
  describeMonthlyPrice,
  describePriceSource,
  mountedClaimOf,
  type CacheClaim,
  type CacheSetting,
  type ManagedCluster,
  type NodePoolWriteResult,
  type Refusal,
} from '../../lib/clusterManager';
import { gpuCapacityRouteRef } from '../../routes';

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
  /**
   * The dry run for the form as it stands: its `cache` block prices the claim
   * the slice would mount (giantswarm/backstage#2493).
   */
  review?: NodePoolWriteResult;
};

/** The id of the zones picker. */
export const ZONES_PICKER_ID = 'gpu-node-pool-zones';

export const LET_PLATFORM_CHOOSE =
  'Let the platform choose — Karpenter searches every zone of the cluster for capacity.';

/**
 * The cache's consequence, in one line each way (decisions of 2026-09-18 on
 * the model cache): what the claim saves, and what it costs — the figure is
 * cluster-manager's, from the dry run, never the plugin's own.
 */
export const CACHE_ON_SAVES =
  'The download and the compile of every later start of the same model are saved.';
export const CACHE_OFF_NOTE =
  "Nothing stands: the weights land on the node's disk at every start, and a cold start costs about 90 s more.";
/** The switch while the cluster keeps a cache: every pool serves from it, and the switch is not the pool's to flip. */
export const CACHE_KEPT_NOTE =
  'This cluster keeps a model cache: every pool of the cluster serves from it, so a pool cannot switch it off. To serve without one, remove the cache';
export const READING_PRICE = 'reading its price from cluster-manager…';

/** How a claim stands in one line: `100 GiB gp3 at 500 MiB/s · $27.37/month · since 18 Sept 2026 · Bound in eu-central-1b`. */
export function describeClaimStanding(claim: CacheClaim): string {
  const since = claim.created
    ? `since ${new Date(claim.created).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    : undefined;
  let where: string | undefined;
  if (claim.error) {
    where = 'not readable as you';
  } else if (claim.phase === 'Bound' && claim.zone) {
    where = `Bound in ${claim.zone}`;
  } else if (claim.phase) {
    where = claim.phase;
  }
  return [
    describeClaimSize(claim),
    describeMonthlyPrice(claim.price) ?? claim.priceNote,
    since,
    where,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The cost line under the switch, from the dry run's cache block: the claim
 * the slice would mount — its size, tier and monthly price, existing or as
 * the connectivity chart would create it — and that it is billed while it
 * exists, after this pool is removed too, until the cache is removed.
 */
export function cacheCostLine(setting: CacheSetting | undefined): string {
  if (!setting) {
    return `${CACHE_ON_SAVES} A cache claim stands with the cluster, ${READING_PRICE}`;
  }
  const { size, price, source } = describeCacheSetting(setting);
  const what = setting.exists
    ? `Serves from the cluster's existing claim${size ? ` (${size})` : ''}`
    : `Creates a cache claim${size ? ` (${size})` : ''}`;
  const cost = price
    ? `${price} at list prices`
    : (source ?? 'its price is not known');
  const standing =
    'billed while the claim exists — after this pool is removed too — until the cache is removed on the GPU capacity page.';
  return `${CACHE_ON_SAVES} ${what}: ${cost}, ${standing}`;
}

/**
 * With the switch off and claims standing: the claims stay and keep costing —
 * said, so a person who switches off is not left thinking the bill stops.
 */
export function cacheOffLine(claims: CacheClaim[] | null | undefined): string {
  const standing = (claims ?? []).filter(claim => !claim.error);
  if (standing.length === 0) {
    return CACHE_OFF_NOTE;
  }
  const kept = standing
    .map(claim => {
      const price = describeMonthlyPrice(claim.price);
      return `${claim.name}${price ? ` (${price})` : ''}`;
    })
    .join(', ');
  return `${CACHE_OFF_NOTE} The existing cache ${kept} stays and keeps costing until it is removed on the GPU capacity page.`;
}

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
  review,
}: PoolPlacementPickerProps) {
  const capacityRoute = useRouteRef(gpuCapacityRouteRef);
  if (!offers.zones && !offers.cache) {
    return null;
  }
  const clusterZones = cluster?.zones;
  const kept = cacheKeptByCluster(cluster);
  const keptClaim = mountedClaimOf(cluster);
  const capacityPath = capacityRoute?.();
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
            isSelected={kept || cache}
            onChange={onCacheChange}
            isDisabled={isBusy || kept}
          />
          {kept ? (
            <Text
              variant="body-small"
              color="secondary"
              data-testid="cache-kept"
            >
              {CACHE_KEPT_NOTE}
              {capacityPath ? (
                <>
                  {' '}
                  under <Link to={capacityPath}>Model cache</Link> on the GPU
                  capacity page.
                </>
              ) : (
                ' under Model cache on the GPU capacity page.'
              )}
              {keptClaim
                ? ` The cache: ${keptClaim.name} — ${describeClaimStanding(keptClaim)}.`
                : ''}
            </Text>
          ) : (
            <Text
              variant="body-small"
              color="secondary"
              data-testid="cache-consequence"
            >
              {cache
                ? cacheCostLine(review?.cache)
                : cacheOffLine(
                    review?.cacheClaims ??
                      cluster?.serving.readiness?.cacheClaims,
                  )}
            </Text>
          )}
          {cache && !kept && review?.cache && (
            <Text
              variant="body-x-small"
              color="secondary"
              data-testid="cache-price-source"
            >
              {describeCacheSetting(review.cache).source}
            </Text>
          )}
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
          {cache
            ? cacheCostLine(review.cache)
            : cacheOffLine(review.cacheClaims)}
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
  if (refused?.cacheOn) {
    return {
      claims: refused.cacheOn.claim ? [refused.cacheOn.claim] : [],
      remedies: refused.cacheOn.remedies,
    };
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
          {describeClaimSize(claim) ? ` — ${describeClaimSize(claim)}` : ''}
          {describeMonthlyPrice(claim.price)
            ? `, ${describeMonthlyPrice(claim.price)}`
            : ''}
          {describePriceSource(claim) && claim.price
            ? ` (${describePriceSource(claim)})`
            : ''}
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
