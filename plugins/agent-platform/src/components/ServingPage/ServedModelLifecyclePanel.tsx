import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { Button, ButtonIcon, Flex, Text } from '@backstage/ui';
import CloseIcon from '@material-ui/icons/Close';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { useMutation } from '@tanstack/react-query';

import { modelManagerApiRef, type TryServedModelResult } from '../../apis';
import { formatSeconds } from '../../lib/lifecycle';
import { modelLifecycleSteps, modelPhaseLabel } from '../../lib/modelLifecycle';
import { LifecycleSteps } from '../LifecycleSteps';
import { CopyEndpointButton } from './ServedModelsGroupHeader';
import type { ServedModelRow } from './ServedModelsTable';

/** The served model whose step timeline is open: Serve's answer, or a row's chevron. */
export type OpenedServedModel = {
  installation: string;
  /** The serving object's name — the row's `name`. */
  name: string;
};

/** Whether a row has a timeline to open: its backend reports a phase or steps. */
export function hasServedModelTimeline(
  row: Pick<ServedModelRow, 'phase' | 'steps'>,
): boolean {
  return row.phase !== undefined || (row.steps?.length ?? 0) > 0;
}

export function isOpenedServedModel(
  opened: OpenedServedModel | undefined,
  row: Pick<ServedModelRow, 'installation' | 'name'>,
): boolean {
  return opened?.installation === row.installation && opened?.name === row.name;
}

export type ServedModelLifecycleToggleProps = {
  row: ServedModelRow;
  isOpen: boolean;
  onToggle: (row: ServedModelRow) => void;
};

/** The row's chevron that opens (or hides) its step timeline. */
export function ServedModelLifecycleToggle({
  row,
  isOpen,
  onToggle,
}: ServedModelLifecycleToggleProps) {
  return (
    <ButtonIcon
      size="small"
      variant="tertiary"
      icon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      aria-label={`${isOpen ? 'Hide' : 'Show'} steps of model ${row.name}`}
      aria-expanded={isOpen}
      onPress={() => onToggle(row)}
    />
  );
}

export type ServedModelLifecyclePanelProps = {
  opened: OpenedServedModel;
  /** The model's row, while model-manager lists it. */
  row: ServedModelRow | undefined;
  onClose: () => void;
};

/** What the person reads of a try: both calls' outcomes, the answer, the URL. */
export function describeTry(result: TryServedModelResult): {
  summary: string;
  ok: boolean;
} {
  const without =
    result.without.status > 0
      ? `${result.without.status} without a token`
      : `no answer without a token (${result.without.error ?? 'unreachable'})`;
  let asPerson: string;
  if (result.with.status === 200) {
    asPerson = `${result.with.status} as you in ${formatSeconds(
      result.with.latencyMs / 1000,
    )}${result.with.content ? ` — “${result.with.content}”` : ''}`;
  } else if (result.with.status > 0) {
    asPerson = `${result.with.status} as you${
      result.with.error ? `: ${result.with.error}` : ''
    }`;
  } else {
    asPerson = `no answer as you (${result.with.error ?? 'unreachable'})`;
  }
  return {
    summary: `${without} · ${asPerson}`,
    ok: result.with.status === 200 && result.without.status === 401,
  };
}

/**
 * What the served model is ready with: its endpoint, the ModelConfig agents
 * use, and **Try it** — one chat completion sent by the portal's backend
 * without a token and as the signed-in person, both outcomes shown, so the
 * gateway's passthrough enforcement is seen, not assumed.
 */
function ReadyBlock({ row }: { row: ServedModelRow }) {
  const modelManagerApi = useApi(modelManagerApiRef);
  const endpoint = row.externalUrl ?? row.internalUrl;
  const modelConfig =
    row.modelConfig ??
    (row.usedBy[0]
      ? { name: row.usedBy[0].name, namespace: row.usedBy[0].namespace }
      : undefined);
  const attempt = useMutation({
    mutationFn: () =>
      modelManagerApi.tryModel(row.installation, row.name, {
        backend: row.backend,
      }),
  });
  const tried = attempt.data ? describeTry(attempt.data) : undefined;
  return (
    <Flex direction="column" gap="2" data-testid="served-model-ready">
      {endpoint ? (
        <Flex gap="1" align="center" style={{ flexWrap: 'wrap' }}>
          <Text as="span" variant="body-small" color="secondary">
            Endpoint
          </Text>
          <Text
            as="span"
            variant="body-small"
            data-testid="served-model-endpoint"
            style={{ overflowWrap: 'anywhere' }}
          >
            <code>{endpoint}</code>
          </Text>
          <CopyEndpointButton url={endpoint} />
        </Flex>
      ) : (
        <Text as="p" variant="body-small" color="secondary">
          model-manager reports no endpoint yet.
        </Text>
      )}
      <Text
        as="p"
        variant="body-small"
        color="secondary"
        data-testid="served-model-config"
      >
        {modelConfig
          ? `ModelConfig ${modelConfig.namespace ?? ''}/${modelConfig.name} — what agents use; the models Gateway checks the person’s token on every call.`
          : 'No ModelConfig yet — model-manager wires one for the served model.'}
      </Text>
      <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant="secondary"
          isDisabled={attempt.isPending || !endpoint}
          onPress={() => attempt.mutate()}
        >
          {attempt.isPending ? 'Trying…' : 'Try it'}
        </Button>
        {tried && (
          <Text
            as="span"
            variant="body-small"
            color={tried.ok ? 'secondary' : 'danger'}
            data-testid="served-model-try"
            style={{ overflowWrap: 'anywhere' }}
          >
            {tried.summary}
          </Text>
        )}
        {attempt.isError && (
          <Text
            as="span"
            variant="body-small"
            color="danger"
            data-testid="served-model-try"
          >
            {attempt.error instanceof Error
              ? attempt.error.message
              : String(attempt.error)}
          </Text>
        )}
      </Flex>
      {attempt.data && (
        <Text as="p" variant="body-small" color="secondary">
          POST {attempt.data.url} · model {attempt.data.model}
        </Text>
      )}
    </Flex>
  );
}

/**
 * What happens underneath after Serve, per served model: model-manager's
 * steps from `list_loaded_models` — the predictor pod scheduled, the GPU
 * node started, the weights in the cache (bytes, then _cached_ or the size),
 * the runtime image pulled, the model loaded, the route ready, the endpoint
 * answering — and, at Ready, the endpoint, the ModelConfig and **Try it**.
 * Opened by Serve or by the row's chevron; the inventory keeps coming at
 * 10 s while the model is on its way, so the steps turn done as
 * model-manager reports them. After Unload the row reads _Stopping_ until
 * model-manager no longer lists the model, and this panel then says so.
 */
export function ServedModelLifecyclePanel({
  opened,
  row,
  onClose,
}: ServedModelLifecyclePanelProps) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (row) {
      setSeen(true);
    }
  }, [row]);
  const steps = useMemo(() => (row ? modelLifecycleSteps(row) : []), [row]);
  const phase = row ? modelPhaseLabel(row) : undefined;
  const isReady = row?.phase === 'ready' || row?.readiness === 'ready';

  let body;
  if (!row) {
    body = (
      <Text
        as="p"
        variant="body-small"
        color="secondary"
        data-testid={seen ? 'served-model-gone' : 'served-model-awaited'}
      >
        {seen
          ? `model-manager no longer lists ${opened.name} on ${opened.installation} — it is gone.`
          : 'model-manager does not list the model yet — the first read after Serve follows in a moment.'}
      </Text>
    );
  } else if (steps.length === 0) {
    body = (
      <Text as="p" variant="body-small" color="secondary">
        model-manager reports no steps for this model: its backend has no serve
        lifecycle, or it predates 0.24.0.
      </Text>
    );
  } else {
    body = (
      <LifecycleSteps steps={steps} aria-label={`Steps of model ${row.name}`} />
    );
  }

  return (
    <Flex
      direction="column"
      gap="3"
      data-testid="served-model-lifecycle"
      style={{
        border: '1px solid var(--bui-border)',
        borderRadius: 'var(--bui-radius-3)',
        padding: 'var(--bui-space-3)',
      }}
    >
      <Flex justify="between" align="center" gap="2">
        <Flex gap="2" align="baseline" style={{ flexWrap: 'wrap' }}>
          <Text as="span" variant="title-x-small">
            Model {opened.name}
          </Text>
          <Text as="span" variant="body-small" color="secondary">
            {opened.installation}
            {phase ? ` · ${phase}` : ''}
          </Text>
        </Flex>
        <ButtonIcon
          size="small"
          variant="tertiary"
          icon={<CloseIcon />}
          aria-label={`Close steps of model ${opened.name}`}
          onPress={onClose}
        />
      </Flex>
      {body}
      {row && isReady && <ReadyBlock row={row} />}
    </Flex>
  );
}
