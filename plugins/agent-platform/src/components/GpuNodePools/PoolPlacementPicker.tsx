import {
  Checkbox,
  CheckboxGroup,
  Flex,
  Skeleton,
  Switch,
  Text,
} from '@backstage/ui';
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
  /** The picked cluster: its node-subnet zones and, when they cannot be read, why; `undefined` before one is picked. */
  cluster: ManagedCluster | undefined;
  offers: PlacementOffer;
  /** The zones chosen: every zone of the cluster by default. */
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

/** How many zone rows the placeholder stands in for before a cluster is picked. */
const PLACEHOLDER_ROWS = 3;

export const EVERY_ZONE =
  'The nodes may launch in every zone of the cluster; Karpenter picks by capacity.';
export const PICK_A_ZONE = 'Pick at least one zone.';
export const ZONES_PENDING =
  'Pick a cluster — its zones are listed here, every one chosen.';

/**
 * The cache's consequence, in one line each way (decisions of 2026-09-18 on
 * the model cache): what the claim saves, and what it costs — the figure is
 * cluster-manager's, from the dry run, never the plugin's own.
 */
export const CACHE_ON_SAVES =
  'The download and the compile of every later start of the same model are saved.';
export const CACHE_OFF_NOTE =
  "Nothing stands: the weights land on the node's disk at every start, and a cold start costs about 90 s more.";
export const CACHE_OFF_COST =
  'Switching it on creates a cache claim, a volume billed every month it exists; its price shows here.';
/** The switch while the cluster keeps a cache: every pool serves from it, and the switch is not the pool's to flip. */
export const CACHE_KEPT_NOTE =
  'This cluster keeps a model cache: every pool of the cluster serves from it, so a pool cannot switch it off. To serve without one, remove the cache';
export const READING_PRICE = "Reading the claim's price from cluster-manager…";
export const BILLED_STANDING =
  'billed while the claim exists, after this pool is removed too, until the cache is removed on the GPU capacity page.';

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
 * The cost line under the switch, the switch's own line when it is on: the
 * monthly price of the claim the slice would mount — cluster-manager's, from
 * the dry run's cache block — and that it is billed while the claim exists,
 * after this pool is removed too, until the cache is removed. Read from a
 * dry run with the cache on only; until one answered, that it is being read.
 */
export function cacheCostLine(setting: CacheSetting | undefined): string {
  if (!setting?.enabled) {
    return READING_PRICE;
  }
  const { price, source } = describeCacheSetting(setting);
  const cost = price
    ? `${price} at list prices`
    : `Its price is not known${source ? ` (${source})` : ''}`;
  return `${cost} — ${BILLED_STANDING}`;
}

/**
 * What the switch on comes to beside the cost: the claim the slice would
 * mount — existing, or as the connectivity chart would create it — and what
 * it saves.
 */
export function cacheOnLine(setting: CacheSetting | undefined): string {
  if (!setting?.enabled) {
    return CACHE_ON_SAVES;
  }
  const { size } = describeCacheSetting(setting);
  const what = setting.exists
    ? `Serves from the cluster's existing claim${size ? ` (${size})` : ''}.`
    : `Creates a cache claim${size ? ` (${size})` : ''}.`;
  return `${what} ${CACHE_ON_SAVES}`;
}

/**
 * With the switch off: what a cold start costs, what switching on would
 * create, and — claims standing — that they stay and keep costing, so a
 * person who leaves the cache off is not left thinking the bill stops.
 */
export function cacheOffLine(claims: CacheClaim[] | null | undefined): string {
  const standing = (claims ?? []).filter(claim => !claim.error);
  if (standing.length === 0) {
    return `${CACHE_OFF_NOTE} ${CACHE_OFF_COST}`;
  }
  const kept = standing
    .map(claim => {
      const price = describeMonthlyPrice(claim.price);
      return `${claim.name}${price ? ` (${price})` : ''}`;
    })
    .join(', ');
  return `${CACHE_OFF_NOTE} The existing cache ${kept} stays and keeps costing until it is removed on the GPU capacity page.`;
}

/** Whether the zones chosen are every zone of the cluster. */
export function everyZone(zones: string[], clusterZones: string[]): boolean {
  return (
    clusterZones.length > 0 && clusterZones.every(zone => zones.includes(zone))
  );
}

/** The zones line on the form: every zone, the ones named, or none picked. */
export function describeZonesOnForm(
  zones: string[],
  clusterZones: string[],
): string {
  if (zones.length === 0) {
    return PICK_A_ZONE;
  }
  if (everyZone(zones, clusterZones)) {
    return EVERY_ZONE;
  }
  return `The nodes launch in ${zones.join(', ')} only.`;
}

/** `eu-central-1a, eu-central-1b, eu-central-1c — every zone of the cluster` / `eu-central-1a, eu-central-1c`. */
export function describeZonesChoice(
  zones: string[],
  clusterZones: string[],
): string {
  return everyZone(zones, clusterZones)
    ? `${zones.join(', ')} — every zone of the cluster`
    : zones.join(', ');
}

/**
 * **Zones** and **Model cache** on the Add GPU node pool form
 * (giantswarm/backstage#2483, #2501): where the pool's nodes may launch —
 * every zone of the cluster's node subnets as `list_clusters` names them by
 * default, any combination, at least one — and whether the pool's serving
 * slice keeps a model cache claim, off by default, its monthly price the
 * switch's own line when it is on. Offered only where the installation's
 * `create_node_pool` takes the argument (its schema); an older
 * cluster-manager shows the form as before. Both sections are in place before
 * a cluster is picked — the zones' rows a placeholder until then — so the
 * cluster's answer fills the form in instead of moving it. What
 * cluster-manager makes of the choice — the pin, the claim the slice mounts —
 * is the dry run's `zonesNote` and `cache.note`, shown in the review and,
 * after Deploy, in the lifecycle panel.
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
  const hasZones = Boolean(clusterZones && clusterZones.length > 0);
  const kept = cacheKeptByCluster(cluster);
  const keptClaim = mountedClaimOf(cluster);
  const capacityPath = capacityRoute?.();
  // The cost is read from a dry run with the cache on; the last answer for
  // the cache off prices nothing and is not this switch's.
  const priced = review?.cache?.enabled ? review.cache : undefined;
  return (
    <Flex direction="column" gap="3" data-testid="pool-placement-picker">
      {offers.zones && (
        <Flex
          direction="column"
          gap="1"
          id={ZONES_PICKER_ID}
          data-testid={hasZones ? 'zones-picker' : 'zones-placeholder'}
        >
          <CheckboxGroup
            label="Zones"
            description="Where the pool's nodes may launch: every zone of the cluster by default, any combination. Fewer zones is a capacity risk taken knowingly; with the model cache on, the pool follows its cache once a claim is bound."
            value={zones}
            onChange={onZonesChange}
            isDisabled={isBusy || !hasZones}
            isInvalid={hasZones && zones.length === 0}
          >
            {(clusterZones ?? []).map(zone => (
              <Checkbox key={zone} value={zone}>
                {zone}
              </Checkbox>
            ))}
          </CheckboxGroup>
          {!cluster && (
            <>
              <Flex direction="column" gap="2" aria-hidden="true">
                {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
                  <Skeleton key={index} width={160} height={20} rounded />
                ))}
              </Flex>
              <Text
                variant="body-small"
                color="secondary"
                data-testid="zones-pending"
              >
                {ZONES_PENDING}
              </Text>
            </>
          )}
          {cluster && clusterZones && clusterZones.length === 0 && (
            <Text
              variant="body-small"
              color="secondary"
              data-testid="zones-note"
            >
              Zones: the platform chooses —{' '}
              {cluster.zonesNote ?? 'the cluster names no node subnet zones'}.
            </Text>
          )}
          {hasZones && (
            <Text
              variant="body-small"
              color={zones.length === 0 ? 'danger' : 'secondary'}
              data-testid="zones-choice"
            >
              {describeZonesOnForm(zones, clusterZones!)}
            </Text>
          )}
        </Flex>
      )}
      {offers.cache && (
        <Flex direction="column" gap="1" data-testid="cache-picker">
          <Switch
            label="Keep a model cache"
            isSelected={kept || cache}
            onChange={onCacheChange}
            isDisabled={isBusy || kept}
          />
          {kept && (
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
          )}
          {!kept && cache && (
            <>
              <Text variant="body-medium" data-testid="cache-cost">
                {cacheCostLine(priced)}
              </Text>
              <Text
                variant="body-small"
                color="secondary"
                data-testid="cache-consequence"
              >
                {cacheOnLine(priced)}
              </Text>
              {priced && (
                <Text
                  variant="body-x-small"
                  color="secondary"
                  data-testid="cache-price-source"
                >
                  {describeCacheSetting(priced).source}
                </Text>
              )}
            </>
          )}
          {!kept && !cache && (
            <Text
              variant="body-small"
              color="secondary"
              data-testid="cache-consequence"
            >
              {cacheOffLine(
                review?.cacheClaims ?? cluster?.serving.readiness?.cacheClaims,
              )}
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
  /** The cluster's zones: the review says when every one is chosen. */
  clusterZones: string[];
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
  clusterZones,
  cache,
  review,
}: PoolPlacementReviewProps) {
  if (!offers.zones && !offers.cache) {
    return null;
  }
  return (
    <Flex direction="column" gap="1" data-testid="placement-review">
      {offers.zones && zones.length > 0 && (
        <Text variant="body-small">
          Zones: {describeZonesChoice(zones, clusterZones)}.
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
            ? `${cacheCostLine(review.cache)} ${cacheOnLine(review.cache)}`
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
