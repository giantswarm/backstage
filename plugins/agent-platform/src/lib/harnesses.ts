import type {
  Harness,
  HarnessRuntime,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** agent-manager's platform Harness when `get_info` has not answered. */
export const DEFAULT_PLATFORM_HARNESS = 'kagent';

/**
 * A Harness an agent can be created on, as the wizard offers it. The name is
 * what `create_agent` takes as `harness` and what the Agent object carries in
 * `spec.harnessRef.name`.
 */
export type HarnessChoice = {
  name: string;
  /** The Harness's `ui.giantswarm.io/display-name`, when an admin set one. */
  displayName?: string;
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
 * The Harnesses of `namespace` an agent can be created on: every one of them,
 * since an Agent names its Harness and nothing admits by label any more. The
 * platform one first, the rest by name.
 */
export function harnessChoicesOf(
  harnesses: readonly Harness[],
  namespace: string,
  platformHarness: string,
): HarnessChoice[] {
  return harnesses
    .filter(harness => harness.getNamespace() === namespace)
    .map(harness => ({
      name: harness.getName(),
      ...(harness.getDisplayNameAnnotation() && {
        displayName: harness.getDisplayNameAnnotation(),
      }),
      runtime: harness.getRuntime(),
      imageName: imageNameOf(harness.getImage()),
    }))
    .sort(
      (a, b) =>
        Number(b.name === platformHarness) -
          Number(a.name === platformHarness) || a.name.localeCompare(b.name),
    );
}
