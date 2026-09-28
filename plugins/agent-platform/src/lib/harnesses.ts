import type {
  Harness,
  HarnessRuntime,
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
 * The Harnesses of `namespace` that admit agents by the harness label, the
 * platform one first and the rest by name. A Harness selecting on anything
 * else admits no agent the Generic chart renders, so it is not offered.
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
      if (!admits) {
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
