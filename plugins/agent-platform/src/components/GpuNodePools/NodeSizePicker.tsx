import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Flex,
  Select,
  Skeleton,
  Text,
} from '@backstage/ui';

import {
  cheapestPriced,
  deployBlocker,
  describeGpus,
  describePrice,
  describePriceSources,
  describeUsable,
  presetFitOf,
  presetLabel,
  sizeThatWouldHost,
  sizesHosting,
  type InstanceShape,
  type NodePoolWriteResult,
  type PresetFit,
  type PresetSizeFit,
} from '../../lib/clusterManager';

export type NodeSizePickerProps = {
  /** The shapes of the first dry run with the chart's defaults: the sizes to pick from; empty while none answered yet. */
  shapes: InstanceShape[];
  /** The presets of that first dry run, judged against every shape: the picker's options. */
  presetFit: PresetFit | undefined;
  /** The latest dry run, judged against the chosen sizes; `undefined` while none answered yet. */
  review: NodePoolWriteResult | undefined;
  /** The chosen sizes; a change re-runs the dry run. */
  sizes: string[];
  onSizesChange: (sizes: string[]) => void;
  /** The preset the person wants to serve; `undefined` for no preference. */
  preset: string | undefined;
  onPresetChange: (preset: string | undefined) => void;
  /** A write in flight: nothing changes until it answers. */
  isBusy: boolean;
  /** A dry run against the current choice in flight. */
  judging: boolean;
  /** The accelerator the sizes are read for: named while they are. */
  accelerator: string;
  /** No cluster picked yet: nothing can be read until one is. */
  pending: boolean;
};

/** The id of the sizes picker, for the blocker's "Add <size>". */
export const SIZES_PICKER_ID = 'gpu-node-pool-sizes';

const ANY_PRESET = '__any__';

/** How many size rows the placeholder stands in for: the chart's default sizes. */
const PLACEHOLDER_ROWS = 3;

/**
 * **Node size** and **I want to serve** on the Add GPU node pool form
 * (giantswarm/backstage#2424): the sizes cluster-manager composes for the
 * accelerator, each with what it leaves a predictor, its GPU memory and its
 * on-demand price per hour (or why none is listed), as the picker of the
 * sizes Karpenter may choose from; the cheapest chosen price as the pool's
 * "from" price. The presets cluster-manager judged — published on the cluster
 * or, before the slice exists, shipped by the chart — as a picker whose
 * options say how each fits the sizes as chosen (giantswarm/backstage#2501):
 * the smallest chosen size hosting it, the size that would, or that no size
 * of the pool does. Choosing one preselects the smallest size hosting it and
 * marks the sizes; a preset no size hosts blocks Deploy with the reason.
 *
 * Both sections are in place from the first paint: before a cluster is picked
 * and while the first dry run runs, the sizes' rows are a placeholder and the
 * preset picker offers no preference, so the answer fills the form in
 * instead of moving it.
 */
export function NodeSizePicker({
  shapes,
  presetFit,
  review,
  sizes,
  onSizesChange,
  preset,
  onPresetChange,
  isBusy,
  judging,
  accelerator,
  pending,
}: NodeSizePickerProps) {
  const hasShapes = shapes.length > 0;
  const presets = presetFit?.presets ?? [];
  // Highlighting follows the first dry run: which of *all* the shapes host the
  // preset, whatever the person has unchecked since.
  const hosting = sizesHosting(shapes, presetFitOf(presetFit, preset));
  const blocker = deployBlocker(review, preset);
  const blockerSize = addableSize(shapes, sizes, blocker?.reason);
  const add = (size: string) =>
    onSizesChange(
      shapes
        .map(shape => shape.size)
        .filter(s => s === size || sizes.includes(s)),
    );
  const cheapest = cheapestPriced(shapes, sizes);
  const priceSources = describePriceSources(shapes);
  const chosenPreset = presetFitOf(presetFit, preset);

  return (
    <Flex
      direction="column"
      gap="3"
      data-testid={hasShapes ? 'node-size-picker' : 'node-size-pending'}
    >
      <Flex
        direction="column"
        gap="1"
        id={SIZES_PICKER_ID}
        data-testid={hasShapes ? 'sizes-picker' : 'sizes-placeholder'}
      >
        <CheckboxGroup
          label="Node size"
          description="The instance sizes Karpenter may pick, smallest first, with what each leaves a predictor after the node's kubelet reservations and daemonsets, and its on-demand price. Changing them re-runs the dry run."
          value={sizes}
          onChange={onSizesChange}
          isDisabled={isBusy || !hasShapes}
          isInvalid={hasShapes && sizes.length === 0}
        >
          {shapes.map(shape => (
            <Checkbox key={shape.size} value={shape.size}>
              {describeShape(shape)}
              {hostNote(shape.size, hosting, chosenPreset)}
            </Checkbox>
          ))}
        </CheckboxGroup>
        {!hasShapes && (
          <>
            <PlaceholderRows rows={PLACEHOLDER_ROWS} />
            <Text
              variant="body-small"
              color="secondary"
              data-testid={pending ? 'sizes-pending' : 'sizes-loading'}
            >
              {pending
                ? `Pick a cluster — the sizes for ${accelerator}, their prices and the presets each hosts are read from cluster-manager's dry run.`
                : `Reading the sizes for ${accelerator} from cluster-manager…`}
            </Text>
          </>
        )}
        {hasShapes && sizes.length === 0 && (
          <Text variant="body-small" color="danger">
            Pick at least one size.
          </Text>
        )}
        {cheapest && (
          <Text variant="body-medium" data-testid="price-summary">
            from {describePrice(cheapest)} per node ({cheapest.instanceType}) —
            the pool scales to zero
          </Text>
        )}
        {priceSources.map(source => (
          <Text key={source} variant="body-x-small" color="secondary">
            Prices: {source}.
          </Text>
        ))}
        {hasShapes && judging && (
          <Text
            variant="body-small"
            color="secondary"
            data-testid="sizes-judging"
          >
            Judging the presets against these sizes…
          </Text>
        )}
      </Flex>

      <Flex direction="column" gap="1">
        <Select
          label="I want to serve"
          description="Preselects the smallest size that hosts the preset and marks the others. Each preset says how it fits the sizes as chosen; the one chosen here blocks Deploy while no size hosts it."
          options={[
            { id: ANY_PRESET, label: 'Any preset — no preference' },
            ...presets.map(fit =>
              presetOption(
                fit,
                presetFitOf(review?.presetFit, fit.preset),
                shapes,
              ),
            ),
          ]}
          selectedKey={preset ?? ANY_PRESET}
          onSelectionChange={key =>
            onPresetChange(key && key !== ANY_PRESET ? String(key) : undefined)
          }
          isDisabled={isBusy || presets.length === 0}
        />
        {presetFit?.source && (
          <Text variant="body-x-small" color="secondary">
            Presets: {presetFit.source}.
          </Text>
        )}
        {presets.length === 0 && presetFit?.note && (
          <Alert
            status="info"
            title="No presets to judge yet"
            description={presetFit.note}
            data-testid="preset-fit-note"
          />
        )}
      </Flex>

      {blocker && (
        <Alert
          status="danger"
          title={`Deploy is blocked: ${presetLabel(blocker)} fits no size of this pool`}
          description={blocker.reason}
          data-testid="deploy-blocked"
          customActions={
            blockerSize && (
              <Button
                size="small"
                variant="secondary"
                onPress={() => add(blockerSize)}
                isDisabled={isBusy}
              >
                Add {blockerSize}
              </Button>
            )
          }
        />
      )}
    </Flex>
  );
}

/** Rows standing in for the sizes while they are read: the same height, nothing to pick yet. */
function PlaceholderRows({ rows }: { rows: number }) {
  return (
    <Flex direction="column" gap="2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} width={420} height={20} rounded />
      ))}
    </Flex>
  );
}

/**
 * `g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU — $1.01/h`; the
 * price note where no price is listed, nothing after the GPUs from an older
 * cluster-manager that prices nothing.
 */
export function describeShape(shape: InstanceShape): string {
  const price = describePrice(shape) ?? shape.priceNote;
  return `${shape.instanceType} — ${describeUsable(shape)}, ${describeGpus(shape)}${
    price ? ` — ${price}` : ''
  }`;
}

/** The size a reason names as the one that would host, when it is one of the pool's and not chosen. */
function addableSize(
  shapes: InstanceShape[],
  sizes: string[],
  reason: string | undefined,
): string | undefined {
  const size = sizeThatWouldHost(reason);
  return size &&
    shapes.some(shape => shape.size === size) &&
    !sizes.includes(size)
    ? size
    : undefined;
}

/** `Qwen3 4B Instruct — fits no chosen size` / `… — fits no size of this pool`; the name alone where a chosen size hosts it. */
export const FITS_NO_CHOSEN_SIZE = ' — fits no chosen size';
export const FITS_NO_SIZE = ' — fits no size of this pool';

/**
 * One preset as an option of **I want to serve**: its name, marked when the
 * sizes as chosen do not host it, and under it the model and the fit — the
 * smallest chosen size hosting it, the size of the pool that would (to add
 * under Node size), or cluster-manager's reason none does. Judged against the
 * chosen sizes by the latest dry run; against every size until one answered.
 */
export function presetOption(
  fit: PresetSizeFit,
  judged: PresetSizeFit | undefined,
  shapes: InstanceShape[],
): { id: string; label: string; description: string } {
  const current = judged ?? fit;
  const hosted = current.size
    ? shapes.find(shape => shape.size === current.size)
    : undefined;
  const would = sizeThatWouldHost(current.reason);
  const family = shapes[0]?.instanceType.split('.')[0];
  let mark = '';
  let detail: string | undefined;
  if (hosted) {
    detail = `from ${hosted.instanceType}`;
  } else if (would && shapes.some(shape => shape.size === would)) {
    mark = FITS_NO_CHOSEN_SIZE;
    detail = `${family ? `${family}.${would}` : would} would host it — add it under Node size`;
  } else {
    mark = FITS_NO_SIZE;
    detail = current.reason;
  }
  return {
    id: fit.preset,
    label: `${presetLabel(fit)}${mark}`,
    description: [fit.model, detail].filter(Boolean).join(' · '),
  };
}

/** ` · hosts Qwen3 8B FP8` / ` · does not host Qwen3 8B FP8` once a preset some size hosts is chosen. */
function hostNote(
  size: string,
  hosting: string[],
  preset: { preset: string; displayName?: string } | undefined,
): string {
  if (!preset || hosting.length === 0) {
    return '';
  }
  const label = presetLabel(preset);
  return hosting.includes(size)
    ? ` · hosts ${label}`
    : ` · does not host ${label}`;
}
