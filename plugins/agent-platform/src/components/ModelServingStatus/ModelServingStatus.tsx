import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Link } from '@backstage/core-components';
import { Button, Flex, Text } from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { usePullModel } from '../../hooks/usePullJobs';
import { useServedModelAction } from '../../hooks/useServedModelAction';
import { stopRowPress } from '../../lib/rowPress';
import {
  SERVED_MODEL_READINESS,
  SERVING_BACKEND_LABEL,
  type ClientServingSummary,
  type ServingShortcut,
} from '../../lib/serving';
import { servingRouteRef } from '../../routes';
import { SERVED_READINESS_ICON } from './readinessIcon';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/** "InferenceService kserve/qwen3", "Ollama model qwen3:0.6b". */
export function describeServedModel(serving: ClientServingSummary): string {
  return `${SERVING_BACKEND_LABEL[serving.backend]} ${
    serving.namespace ? `${serving.namespace}/` : ''
  }${serving.name}`;
}

/**
 * The line under a client's endpoint: "Served by Ollama model qwen3:0.6b" —
 * or, when nothing serves it, "Points at Ollama model qwen2.5:0.5b", since
 * "served by" would be a lie.
 */
export function describeServedBy(serving: ClientServingSummary): string {
  const what = describeServedModel(serving);
  return serving.readiness === 'notServing'
    ? `Points at ${what}`
    : `Served by ${what}`;
}

/** The tooltip: what it is, the state in a sentence, and why. */
export function servingTitle(serving: ClientServingSummary): string {
  return `${describeServedModel(serving)} is ${
    SERVED_MODEL_READINESS[serving.readiness].phrase
  } — ${serving.message}`;
}

export type ModelServingStatusProps = {
  /** The client's state, from `useServing().servingStateFor`. */
  serving: ClientServingSummary;
  /**
   * The one-click fix to offer, from `servingShortcutFor`. Renders a button
   * that runs it through model-manager; needs the plugin's QueryClientProvider
   * and the model-manager API. Without it, `notServing` links to the Serving
   * view instead.
   */
  shortcut?: ServingShortcut;
  /** `cell` — small text for a table row; `block` — body text for a page. */
  variant?: 'cell' | 'block';
};

/**
 * What the serving layer says about the model behind a client (a kagent
 * ModelConfig): which model, its readiness label, and the shortcut that fixes
 * a state that needs fixing — the same block on the Model configs view, the
 * model detail page and the agent detail page. Labels, intents and wording
 * come from `lib/serving.ts`, the same place the Serving view reads them, so
 * a model is never "Idle" in one view and "Not loaded" in another.
 */
export function ModelServingStatus({
  serving,
  shortcut,
  variant = 'cell',
}: ModelServingStatusProps) {
  const servingRoute = useRouteRef(servingRouteRef);
  const { label, intent } = SERVED_MODEL_READINESS[serving.readiness];
  const title = servingTitle(serving);
  const notServing = serving.readiness === 'notServing';

  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap', minWidth: 0 }}>
      <Text
        variant={variant === 'cell' ? 'body-small' : 'body-medium'}
        color="secondary"
        truncate
        title={title}
      >
        {describeServedBy(serving)}
      </Text>
      {/* Tagged so a test (and a screen reader) can tell the model's state
          apart from the ModelConfig's own Accepted / agent's Ready label. */}
      <span data-testid="model-serving-readiness">
        <StatusLabel
          label={label}
          intent={intent}
          icon={SERVED_READINESS_ICON[serving.readiness]}
          title={title}
        />
      </span>
      {shortcut && (
        <ServingShortcutButton serving={serving} shortcut={shortcut} />
      )}
      {notServing && !shortcut && servingRoute && (
        <Link
          to={servingRoute()}
          onPointerDown={stopRowPress}
          onPointerUp={stopRowPress}
          onClick={stopRowPress}
        >
          Serving view
        </Link>
      )}
    </Flex>
  );
}

/**
 * The fix, inline: Load (Ollama) / Serve (KServe) a model that is not
 * running, Pull one that is gone. Runs through the same hooks as the Serving
 * view's row menu and reports through a toast; the inventory refetch the
 * hooks trigger is what updates the label.
 */
export function ServingShortcutButton({
  serving,
  shortcut,
}: {
  serving: ClientServingSummary;
  shortcut: ServingShortcut;
}) {
  const toastApi = useApi(toastApiRef);
  const action = useServedModelAction(serving.installation);
  const pull = usePullModel(serving.installation);
  const kserve = serving.backend === 'kserve';
  const isBusy = action.isPending || pull.isPending;

  let label: string;
  let busyLabel: string;
  if (shortcut.kind === 'pull') {
    label = 'Pull';
    busyLabel = 'Pulling…';
  } else if (kserve) {
    label = 'Serve';
    busyLabel = 'Serving…';
  } else {
    label = 'Load';
    busyLabel = 'Loading…';
  }

  const run = async () => {
    try {
      if (shortcut.kind === 'pull') {
        // The ModelConfig exists — that is why we are here — so no wiring.
        await pull.mutateAsync({ model: shortcut.ref, wire: false });
        toastApi.post({
          title: `${serving.name}: pull started`,
          description: 'The Serving view follows the download.',
          status: 'success',
          timeout: TOAST_TIMEOUT_MS,
        });
      } else {
        await action.run({ type: 'load', model: shortcut.ref });
        toastApi.post({
          title: kserve
            ? `${serving.name}: InferenceService requested`
            : `${serving.name}: loaded into memory`,
          description: kserve
            ? 'The status follows the InferenceService.'
            : undefined,
          status: 'success',
          timeout: TOAST_TIMEOUT_MS,
        });
      }
    } catch (failure) {
      toastApi.post({
        title: `${label} failed for ${serving.name}`,
        description: (failure as Error).message,
        status: 'danger',
        timeout: TOAST_TIMEOUT_MS * 2,
      });
    }
  };

  return (
    // In a table row the press must not also fire the row's navigation —
    // the same guard the name links carry (see `stopRowPress`).
    <span
      role="presentation"
      onPointerDown={stopRowPress}
      onPointerUp={stopRowPress}
      onClick={stopRowPress}
    >
      <Button
        size="small"
        variant="secondary"
        isDisabled={isBusy}
        onPress={run}
        aria-label={`${label} ${serving.name}`}
      >
        {isBusy ? busyLabel : label}
      </Button>
    </span>
  );
}
