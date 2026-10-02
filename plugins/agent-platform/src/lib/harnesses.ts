import {
  HARNESS_LABEL,
  type Harness,
  type HarnessAgentTemplateSelector,
  type HarnessRuntime,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** agent-manager's platform Harness when `get_info` has not answered. */
export const DEFAULT_PLATFORM_HARNESS = 'kagent';

/** A Harness an agent can be created on, as the wizard offers it. */
export type HarnessChoice = {
  name: string;
  /** The Harness's `ui.giantswarm.io/display-name`, when an admin set one. */
  displayName?: string;
  /** The `agent-platform.giantswarm.io/harness` value it admits: what `create_agent` takes. */
  admits: string;
  runtime?: HarnessRuntime;
  /** The image's repository name, without registry, tag or digest. */
  imageName?: string;
};

const RUNTIME_LABELS: Record<HarnessRuntime, string> = {
  kagent: 'Declarative (Go ADK)',
  claude: 'Claude Code',
  codex: 'Codex',
  byo: 'Custom image',
};

export function runtimeLabel(runtime: HarnessRuntime | undefined): string {
  return runtime ? RUNTIME_LABELS[runtime] : 'Unknown runtime';
}

/**
 * What a person calls the Harness: its display name, else its runtime family.
 * Two Harnesses of one family (Claude Code with two toolchains, say) read the
 * same without a display name; the Harness name beneath tells them apart.
 */
export function harnessTitle(choice: HarnessChoice): string {
  return choice.displayName ?? runtimeLabel(choice.runtime);
}

/** `gsoci.azurecr.io/giantswarm/kagent/claude-harness@sha256:…` → `claude-harness`. */
export function imageNameOf(image: string | undefined): string | undefined {
  const repository = image?.split('@')[0];
  const last = repository?.split('/').pop();
  return last?.replace(/:[^:]*$/, '') || undefined;
}

/**
 * The labels the Generic agent chart (`agenttemplate.labels`) stamps on an
 * AgentTemplate whose value does not depend on the release. The wizard sends
 * no extra `labels`, so these plus the harness label are all of them.
 */
const FIXED_TEMPLATE_LABELS: Readonly<Record<string, string>> = {
  app: 'agent',
  'app.kubernetes.io/name': 'agent',
  'app.kubernetes.io/managed-by': 'Helm',
  'application.giantswarm.io/team': 'bumblebee',
};

/**
 * Labels the template carries with a per-release value (release name, chart
 * version, the HelmRelease helm-controller stamps): present, value unknown.
 */
const PER_RELEASE_TEMPLATE_LABELS: ReadonlySet<string> = new Set([
  'app.kubernetes.io/instance',
  'app.kubernetes.io/version',
  'helm.sh/chart',
  'helm.toolkit.fluxcd.io/name',
  'helm.toolkit.fluxcd.io/namespace',
]);

/**
 * Whether every requirement of `selector` holds for the AgentTemplate the
 * wizard creates with `harness` = `admits`.
 *
 * An empty `matchLabels` value counts as no requirement: the platform
 * Harness template drops every selector label whose value is empty, which is
 * how agent-platform's values remove the kagent chart's own
 * `kagent.dev/harness` key. A requirement on a per-release label can only be
 * met by `Exists`; any value it asks for is treated as unmet, since no value
 * holds for every agent. An unknown operator is unmet.
 *
 * A best-effort read: agent-manager's `requireHarness` and the Harness's own
 * verdict on the template stay the authoritative checks.
 */
export function selectorAdmitsAgent(
  selector: HarnessAgentTemplateSelector,
  admits: string,
): boolean {
  const labels: Record<string, string> = {
    ...FIXED_TEMPLATE_LABELS,
    [HARNESS_LABEL]: admits,
  };
  const has = (key: string) =>
    key in labels || PER_RELEASE_TEMPLATE_LABELS.has(key);

  const labelsMet = Object.entries(selector.matchLabels ?? {}).every(
    ([key, value]) => value === '' || labels[key] === value,
  );
  const expressionsMet = (selector.matchExpressions ?? []).every(
    ({ key, operator, values = [] }) => {
      switch (operator) {
        case 'Exists':
          return has(key);
        case 'DoesNotExist':
          return !has(key);
        case 'In':
          return key in labels && values.includes(labels[key]);
        case 'NotIn':
          return (
            !PER_RELEASE_TEMPLATE_LABELS.has(key) &&
            !(key in labels && values.includes(labels[key]))
          );
        default:
          return false;
      }
    },
  );
  return labelsMet && expressionsMet;
}

/**
 * The Harnesses of `namespace` that admit the agent the wizard creates on
 * them (see {@link selectorAdmitsAgent}), the platform one first and the rest
 * by name.
 */
export function harnessChoicesOf(
  harnesses: readonly Harness[],
  namespace: string,
  platformHarness: string,
): HarnessChoice[] {
  return harnesses
    .filter(harness => harness.getNamespace() === namespace)
    .flatMap(harness => {
      const admits = harness.getAdmittedHarnessLabel();
      const selector = harness.getAgentTemplateSelector();
      if (!admits || !selector || !selectorAdmitsAgent(selector, admits)) {
        return [];
      }
      return [
        {
          name: harness.getName(),
          ...(harness.getDisplayNameAnnotation() && {
            displayName: harness.getDisplayNameAnnotation(),
          }),
          admits,
          runtime: harness.getRuntime(),
          imageName: imageNameOf(harness.getImage()),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.admits === platformHarness) -
          Number(a.admits === platformHarness) || a.name.localeCompare(b.name),
    );
}
