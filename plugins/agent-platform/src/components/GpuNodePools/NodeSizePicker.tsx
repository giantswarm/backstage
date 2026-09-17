import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Flex,
  Select,
  Text,
} from '@backstage/ui';

import {
  cheapestPriced,
  deployBlocker,
  describeGpus,
  describePrice,
  describePriceSources,
  describeUsable,
  isWarningFor,
  presetFitOf,
  presetLabel,
  sizeThatWouldHost,
  sizesHosting,
  type InstanceShape,
  type NodePoolWriteResult,
  type PresetFit,
} from '../../lib/clusterManager';

export type NodeSizePickerProps = {
  /** The shapes of the first dry run with the chart's defaults: the sizes to pick from. */
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
};

/** The id of the sizes picker, for the warnings' "Choose sizes". */
export const SIZES_PICKER_ID = 'gpu-node-pool-sizes';

const ANY_PRESET = '__any__';

/**
 * **Node size** and **I want to serve** on the Add GPU node pool form
 * (giantswarm/backstage#2424): the sizes cluster-manager composes for the
 * accelerator, each with what it leaves a predictor, its GPU memory and its
 * on-demand price per hour (or why none is listed), as the picker of the
 * sizes Karpenter may choose from; the cheapest chosen price as the pool's
 * "from" price. The presets cluster-manager judged — published on the cluster
 * or, before the slice exists, shipped by the chart — as a picker: choosing
 * one preselects the smallest size hosting it and marks the others; a preset
 * no size hosts blocks Deploy with the reason, the warnings for other
 * presets no chosen size hosts stand out and do not block. Only a note and
 * no presets shows the note.
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
}: NodeSizePickerProps) {
  const presets = presetFit?.presets ?? [];
  // Highlighting follows the first dry run: which of *all* the shapes host the
  // preset, whatever the person has unchecked since.
  const hosting = sizesHosting(shapes, presetFitOf(presetFit, preset));
  const blocker = deployBlocker(review, preset);
  const warnings = (review?.warnings ?? []).filter(
    warning => !preset || !isWarningFor(warning, preset),
  );
  const addable = (text: string | undefined) => {
    const size = sizeThatWouldHost(text);
    return size &&
      shapes.some(shape => shape.size === size) &&
      !sizes.includes(size)
      ? size
      : undefined;
  };
  const add = (size: string) =>
    onSizesChange(
      shapes
        .map(shape => shape.size)
        .filter(s => s === size || sizes.includes(s)),
    );
  const blockerSize = addable(blocker?.reason);
  const warningSizes = [
    ...new Set(warnings.map(addable).filter((s): s is string => Boolean(s))),
  ];
  const cheapest = cheapestPriced(shapes, sizes);
  const priceSources = describePriceSources(shapes);
  const chosenPreset = presetFitOf(presetFit, preset);

  return (
    <Flex direction="column" gap="3" data-testid="node-size-picker">
      <Flex
        direction="column"
        gap="1"
        id={SIZES_PICKER_ID}
        data-testid="sizes-picker"
      >
        <CheckboxGroup
          label="Node size"
          description="The instance sizes Karpenter may pick, smallest first, with what each leaves a predictor after the node's kubelet reservations and daemonsets, and its on-demand price. Changing them re-runs the dry run."
          value={sizes}
          onChange={onSizesChange}
          isDisabled={isBusy}
          isInvalid={sizes.length === 0}
        >
          {shapes.map(shape => (
            <Checkbox key={shape.size} value={shape.size}>
              {describeShape(shape)}
              {hostNote(shape.size, hosting, chosenPreset)}
            </Checkbox>
          ))}
        </CheckboxGroup>
        {sizes.length === 0 && (
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
        {judging && (
          <Text
            variant="body-small"
            color="secondary"
            data-testid="sizes-judging"
          >
            Judging the presets against these sizes…
          </Text>
        )}
      </Flex>

      {presets.length > 0 ? (
        <Flex direction="column" gap="1">
          <Select
            label="I want to serve"
            description="Preselects the smallest size that hosts the preset and marks the others. A preset no size hosts blocks Deploy; other presets' warnings stand out and do not block."
            options={[
              { id: ANY_PRESET, label: 'Any preset — no preference' },
              ...presets.map(fit => ({
                id: fit.preset,
                label: presetLabel(fit),
                ...(fit.model ? { description: fit.model } : {}),
              })),
            ]}
            selectedKey={preset ?? ANY_PRESET}
            onSelectionChange={key =>
              onPresetChange(
                key && key !== ANY_PRESET ? String(key) : undefined,
              )
            }
            isDisabled={isBusy}
          />
          {presetFit?.source && (
            <Text variant="body-x-small" color="secondary">
              Presets: {presetFit.source}.
            </Text>
          )}
        </Flex>
      ) : (
        presetFit?.note && (
          <Alert
            status="info"
            title="No presets to judge yet"
            description={presetFit.note}
            data-testid="preset-fit-note"
          />
        )
      )}

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

      {warnings.length > 0 && (
        <Alert
          status="warning"
          title={`${warnings.length} preset${warnings.length === 1 ? '' : 's'} fit${warnings.length === 1 ? 's' : ''} no size of this pool — Deploy is not blocked`}
          description={
            <Flex direction="column" gap="1">
              {warnings.map(warning => (
                <Text key={warning} variant="body-small">
                  {warning}
                </Text>
              ))}
            </Flex>
          }
          data-testid="fit-warnings"
          customActions={
            <Flex gap="2">
              {warningSizes.map(size => (
                <Button
                  key={size}
                  size="small"
                  variant="secondary"
                  onPress={() => add(size)}
                  isDisabled={isBusy}
                >
                  Add {size}
                </Button>
              ))}
              <Button
                size="small"
                variant="tertiary"
                onPress={focusSizesPicker}
              >
                Choose sizes
              </Button>
            </Flex>
          }
        />
      )}
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

function focusSizesPicker() {
  const picker = document.getElementById(SIZES_PICKER_ID);
  picker?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  picker?.querySelector<HTMLInputElement>('input')?.focus();
}
