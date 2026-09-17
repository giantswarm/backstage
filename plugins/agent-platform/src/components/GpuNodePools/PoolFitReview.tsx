import { useMemo } from 'react';
import {
  Alert,
  Cell,
  CellText,
  Flex,
  Table,
  Text,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';

import {
  cheapestPriced,
  deployBlocker,
  describePresetNeeds,
  describePrice,
  presetFitOf,
  presetLabel,
  type InstanceShape,
  type NodePoolWriteResult,
  type PresetFit,
  type PresetSizeFit,
} from '../../lib/clusterManager';
import { describeShape } from './NodeSizePicker';

export type PoolFitReviewProps = {
  /** The shapes of the first dry run with the defaults: every size the form offered. */
  shapes: InstanceShape[];
  /** The presets of that first dry run: the names the form's picker offered. */
  presetFit: PresetFit | undefined;
  /** The latest dry run, judged against the chosen sizes. */
  review: NodePoolWriteResult;
  /** The sizes chosen on the form. */
  sizes: string[];
  /** The preset chosen on the form; `undefined` for no preference. */
  preset: string | undefined;
};

type PresetRow = PresetSizeFit & { id: string };

/**
 * **What this pool can serve** — the review's fit table: the sizes and the
 * preset as chosen on the form (one state; Back changes them), then every
 * preset cluster-manager judged against those sizes with the smallest size
 * hosting each and its price, or why none does. The preset the person wants
 * to serve blocks Deploy with the reason when no chosen size hosts it.
 */
export function PoolFitReview({
  shapes,
  presetFit,
  review,
  sizes,
  preset,
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
  const blocker = deployBlocker(review, preset);
  const chosenShapes = shapes.filter(shape => sizes.includes(shape.size));
  const cheapest = cheapestPriced(shapes, sizes);
  const chosenPreset = presetFitOf(presetFit, preset);

  return (
    <Flex direction="column" gap="3" data-testid="pool-fit-review">
      <Text variant="title-x-small">What this pool can serve</Text>

      <Flex direction="column" gap="1" data-testid="chosen-sizes">
        <Text variant="body-small" color="secondary">
          Sizes, as chosen on the form:
        </Text>
        {chosenShapes.map(shape => (
          <Text key={shape.size} variant="body-small">
            {describeShape(shape)}
          </Text>
        ))}
        {cheapest && (
          <Text variant="body-small">
            from {describePrice(cheapest)} per node ({cheapest.instanceType}) —
            the pool scales to zero
          </Text>
        )}
        <Text variant="body-small" color="secondary">
          I want to serve:{' '}
          {chosenPreset
            ? `${presetLabel(chosenPreset)}${chosenPreset.model ? ` (${chosenPreset.model})` : ''}`
            : 'any preset — no preference'}
        </Text>
      </Flex>

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
          title={`Deploy is blocked: ${presetLabel(blocker)} fits no size of this pool`}
          description={`${blocker.reason} — Back to change the sizes.`}
          data-testid="deploy-blocked"
        />
      )}
    </Flex>
  );
}

function presetColumns(shapes: InstanceShape[]): ColumnConfig<PresetRow>[] {
  const shapeOf = (size: string | undefined) =>
    shapes.find(shape => shape.size === size);
  return [
    {
      id: 'preset',
      label: 'Preset',
      isRowHeader: true,
      cell: row => (
        <CellText title={presetLabel(row)} description={row.model} />
      ),
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
      cell: row => {
        const shape = shapeOf(row.size);
        return row.size ? (
          <CellText
            title={`✔ ${row.size}`}
            description={[shape?.instanceType, shape && describePrice(shape)]
              .filter(Boolean)
              .join(' — ')}
          />
        ) : (
          <Cell>
            <Text variant="body-small" color="secondary">
              ✘ {row.reason}
            </Text>
          </Cell>
        );
      },
    },
  ];
}
