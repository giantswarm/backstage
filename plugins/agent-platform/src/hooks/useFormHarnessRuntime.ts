import type { HarnessRuntime } from '@giantswarm/backstage-plugin-kubernetes-react';

import { harnessTitle, isCodingRuntime } from '../lib/harnesses';
import { useNewAgentForm } from '../components/NewAgentFormProvider';
import { useRuntimeChoices } from '../components/HarnessPicker';

/**
 * The agent form's Harness and its runtime, read where the runtime field
 * reads them (`useRuntimeChoices`): the picked choice's, else the edited
 * agent's Harness of that name, else the platform Harness, which a request
 * naming none runs on and which may be a coding one too.
 *
 * `isCoding` is `undefined` while the runtime is not known (not read yet, or
 * not readable).
 */
export function useFormHarnessRuntime(): {
  /** The Harness the agent runs on, by name and, once read, title. */
  harness: { name: string; title?: string };
  runtime: HarnessRuntime | undefined;
  isCoding: boolean | undefined;
  /** No Harness named: the platform's. */
  onPlatformHarness: boolean;
} {
  const { state, edit } = useNewAgentForm();
  const { choices, platformHarness, platformChoice } = useRuntimeChoices();
  const named = state.harness?.name ?? edit?.agent.harness;
  const onPlatformHarness = !named || named === platformHarness;

  // A picked choice carries its runtime; an edited agent's Harness is seeded
  // by its name alone, so its runtime is the namespace's Harness of that name.
  let choice = state.harness?.runtime ? state.harness : undefined;
  if (!choice) {
    choice = named
      ? (choices.find(candidate => candidate.name === named) ?? state.harness)
      : platformChoice;
  }
  const runtime = choice?.runtime;
  return {
    harness: {
      name: named ?? platformHarness,
      title: choice && runtime ? harnessTitle(choice) : undefined,
    },
    runtime,
    isCoding: runtime === undefined ? undefined : isCodingRuntime(runtime),
    onPlatformHarness,
  };
}
