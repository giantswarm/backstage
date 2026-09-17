import { useMemo } from 'react';
import {
  Alert,
  Button,
  Cell,
  CellText,
  Checkbox,
  CheckboxGroup,
  Flex,
  Select,
  Table,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';

import {
  deployBlocker,
  describeGpus,
  describePresetNeeds,
  describeUsable,
  isWarningFor,
  presetFitOf,
  sizeThatWouldHost,
  sizesHosting,
  type InstanceShape,
  type NodePoolWriteResult,
  type PresetSizeFit,
} from '../../lib/clusterManager';

export type PoolFitReviewProps = {
  /** The shapes of the first dry run with the defaults: the sizes to pick from. */
  shapes: InstanceShape[];
  /** The presets of that first dry run, judged against every shape: the picker's options. */
  presets: PresetSizeFit[];
  /** The latest dry run, judged against the chosen sizes. */
  review: NodePoolWriteResult;
  /** The chosen sizes; a change re-runs the dry run. */
  sizes: string[];
  onSizesChange: (sizes: string[]) => void;
  /** The preset the person wants to serve; `undefined` for no preference. */
  preset: string | undefined;
  onPresetChange: (preset: string | undefined) => void;
  isBusy: boolean;
};

/** The id of the sizes picker, for the warnings' "Choose sizes". */
export const SIZES_PICKER_ID = 'gpu-node-pool-sizes';

const ANY_PRESET = '__any__';

type PresetRow = PresetSizeFit & { id: string };

/**
 * **What this pool can serve** — the review's fit table (cluster-manager
 * 0.6.0+, giantswarm/agent-platform#502): the pool's sizes with what each
 * leaves a predictor, as the picker of the sizes Karpenter may choose from;
 * the presets published on the cluster with the smallest size hosting each or
 * why none does; the warnings for presets no size hosts, naming the size that
 * would. An optional **I want to serve** highlights the sizes that host one
 * preset; a preset this pool cannot host blocks Deploy with the reason, any
 * other preset's warning stands out and does not block. Without presets on
 * the cluster the note says so instead of an empty table.
 */
export function PoolFitReview({
  shapes,
  presets,
  review,
  sizes,
  onSizesChange,
  preset,
  onPresetChange,
  isBusy,
}: PoolFitReviewProps) {
  const judged = review.presetFit?.presets;
  const rows = useMemo<PresetRow[]>(
    () => (judged ?? []).map(fit => ({ ...fit, id: fit.preset })),
    [judged],
  );
  const { tableProps } = useTable<PresetRow>({
    mode: 'complete',
    data: rows,
    paginationOptions: { type: 'none' },
  });
  const columns = useMemo(() => presetColumns(shapes), [shapes]);

  // Highlighting follows the first dry run: which of *all* the shapes host the
  // preset, whatever the person has unchecked since.
  const hosting = sizesHosting(shapes, presetFitOf({ presets }, preset));
  const blocker = deployBlocker(review, preset);
  const warnings = (review.warnings ?? []).filter(
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

  return (
    <Flex direction="column" gap="3" data-testid="pool-fit-review">
      <Text variant="title-x-small">What this pool can serve</Text>

      <Flex
        direction="column"
        gap="1"
        id={SIZES_PICKER_ID}
        data-testid="sizes-picker"
      >
        <CheckboxGroup
          label="Sizes"
          description="The instance sizes Karpenter may pick, smallest first, with what each leaves a predictor after the node's kubelet reservations and daemonsets. Changing them re-runs the dry run."
          value={sizes}
          onChange={onSizesChange}
          isDisabled={isBusy}
          isInvalid={sizes.length === 0}
        >
          {shapes.map(shape => (
            <Checkbox key={shape.size} value={shape.size}>
              {shape.instanceType} — {describeUsable(shape)},{' '}
              {describeGpus(shape)}
              {hostNote(shape.size, hosting, preset)}
            </Checkbox>
          ))}
        </CheckboxGroup>
        {sizes.length === 0 && (
          <Text variant="body-small" color="danger">
            Pick at least one size.
          </Text>
        )}
      </Flex>

      {presets.length > 0 && (
        <Select
          label="I want to serve"
          description="Highlights the sizes that host the preset. A preset this pool cannot host blocks Deploy; other presets' warnings stand out and do not block."
          options={[
            { id: ANY_PRESET, label: 'Any preset — no preference' },
            ...presets.map(fit => ({ id: fit.preset, label: fit.preset })),
          ]}
          selectedKey={preset ?? ANY_PRESET}
          onSelectionChange={key =>
            onPresetChange(key && key !== ANY_PRESET ? String(key) : undefined)
          }
          isDisabled={isBusy}
        />
      )}

      {rows.length > 0 ? (
        <Flex direction="column" gap="1" data-testid="preset-fit">
          <Table<PresetRow> {...tableProps} columnConfig={columns} />
          {review.presetFit?.source && (
            <Text variant="body-small" color="secondary">
              Presets: {review.presetFit.source}.
            </Text>
          )}
        </Flex>
      ) : (
        review.presetFit?.note && (
          <Alert
            status="info"
            title="No presets to judge yet"
            description={review.presetFit.note}
            data-testid="preset-fit-note"
          />
        )
      )}

      {blocker && (
        <Alert
          status="danger"
          title={`Deploy is blocked: ${blocker.preset} fits no size of this pool`}
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

/** ` · hosts <preset>` / ` · does not host <preset>` once a preset some size hosts is chosen. */
function hostNote(
  size: string,
  hosting: string[],
  preset: string | undefined,
): string {
  if (!preset || hosting.length === 0) {
    return '';
  }
  return hosting.includes(size)
    ? ` · hosts ${preset}`
    : ` · does not host ${preset}`;
}

function focusSizesPicker() {
  const picker = document.getElementById(SIZES_PICKER_ID);
  picker?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  picker?.querySelector<HTMLInputElement>('input')?.focus();
}

function presetColumns(shapes: InstanceShape[]): ColumnConfig<PresetRow>[] {
  const instanceType = (size: string | undefined) =>
    shapes.find(shape => shape.size === size)?.instanceType;
  return [
    {
      id: 'preset',
      label: 'Preset',
      isRowHeader: true,
      cell: row => <CellText title={row.preset} />,
    },
    {
      id: 'needs',
      label: 'Needs',
      cell: row => (
        <Cell>
          <Text variant="body-small">{describePresetNeeds(row)}</Text>
        </Cell>
      ),
    },
    {
      id: 'hostedBy',
      label: 'Hosted by',
      cell: row =>
        row.size ? (
          <CellText
            title={`✔ ${row.size}`}
            description={instanceType(row.size)}
          />
        ) : (
          <Cell>
            <Text variant="body-small" color="secondary">
              ✘ {row.reason}
            </Text>
          </Cell>
        ),
    },
  ];
}
