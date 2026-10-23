import type { HarnessRuntime } from '@giantswarm/backstage-plugin-kubernetes-react';

import { useHarnessChoices } from './useHarnessChoices';
import { harnessTitle, isCodingRuntime } from '../lib/harnesses';
import { useNewAgentForm } from '../components/NewAgentFormProvider';

/**
 * The agent form's Harness and its runtime: the picked choice's, else the
 * namespace's Harness of the edited agent's name. Read only where a Harness is
 * named; none is the platform's.
 *
 * `isCoding` is `undefined` while a named Harness other than the platform's
 * has no known runtime: it may be a coding one, so the form offers nothing
 * a coding Harness refuses until it knows. The platform Harness counts as not
 * coding until read otherwise.
 */
export function useFormHarnessRuntime(): {
  harnessName: string | undefined;
  runtime: HarnessRuntime | undefined;
  /** The Harness as a person names it, once its runtime is known. */
  title: string | undefined;
  isCoding: boolean | undefined;
  /** The namespace's Harnesses are still being read. */
  isLoading: boolean;
} {
  const { state, edit } = useNewAgentForm();
  const namespace = state.tenant ?? state.modelConfigNamespace;
  const harnessName = state.harness?.name ?? edit?.agent.harness;
  const { choices, platformHarness, isLoading } = useHarnessChoices(
    state.installation,
    harnessName ? namespace : undefined,
  );
  // An edited agent's Harness is seeded by its name alone: its runtime is the
  // namespace's Harness of that name.
  const choice = state.harness?.runtime
    ? state.harness
    : (choices.find(candidate => candidate.name === harnessName) ??
      state.harness);
  const runtime = choice?.runtime;
  const onPlatformHarness = !harnessName || harnessName === platformHarness;

  let isCoding: boolean | undefined = isCodingRuntime(runtime);
  if (runtime === undefined && !onPlatformHarness) {
    isCoding = undefined;
  }
  return {
    harnessName,
    runtime,
    title: choice && runtime ? harnessTitle(choice) : undefined,
    isCoding,
    isLoading,
  };
}
