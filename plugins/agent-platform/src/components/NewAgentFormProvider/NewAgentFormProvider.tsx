import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { slugify } from '../../lib/slugify';
import { DiscoveredSkill, skillId } from '../../lib/skills';
import { toggleSelector, toolsetProblems } from '../../lib/toolset';

export type NewAgentFormState = {
  name: string;
  slug: string;
  description: string;
  installation: string | undefined;
  modelConfigName: string | undefined;
  modelConfigNamespace: string | undefined;
  systemMessage: string;
  /** Skills the user picked, in selection order. Optional — may be empty. */
  selectedSkills: DiscoveredSkill[];
  /**
   * The agent's toolset: inline selectors (`preset:`, `server:`, `workflow:`,
   * `tool:`), in selection order. Starts empty on purpose — nothing the author
   * did not consciously add — and the Tools step does not let the flow continue
   * until it holds at least one selector (`preset:none` is one).
   */
  toolset: string[];
};

export type NewAgentFormContextValue = {
  state: NewAgentFormState;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setInstallation: (installation: string | undefined) => void;
  selectModelConfig: (name: string, namespace: string) => void;
  setSystemMessage: (systemMessage: string) => void;
  /** Adds the skill if not selected, removes it if already selected. */
  toggleSkill: (skill: DiscoveredSkill) => void;
  /**
   * Adds the selector if absent, removes it if present. `preset:none` and
   * `preset:full` replace the whole selection; adding anything else drops them
   * (see `toggleSelector`).
   */
  toggleToolsetSelector: (selector: string) => void;
  /** Replaces the whole toolset — start from an existing agent's, or clear it. */
  setToolset: (selectors: string[]) => void;
  /**
   * True when the toolset can be applied: at least one selector, none of them
   * malformed, and no more than the inline cap. What the Tools step's Continue
   * and the review page's deploy gate on.
   */
  isToolsetChosen: boolean;
  /** Why the toolset cannot be applied yet, empty when it can (or is still empty). */
  toolsetProblems: string[];
  reset: () => void;
  /** True when the form has no validation errors. */
  isComplete: boolean;
  /**
   * Human-readable validation problems, in form order. Empty when the form is
   * valid. Drives the submit-time feedback.
   */
  validationErrors: string[];
};

const initialState: NewAgentFormState = {
  name: '',
  slug: '',
  description: '',
  installation: undefined,
  modelConfigName: undefined,
  modelConfigNamespace: undefined,
  // Seeded from the chart's default at runtime by NewAgentPage; empty means
  // "use the chart default" (composeManifests omits it).
  systemMessage: '',
  selectedSkills: [],
  toolset: [],
};

// RFC1123 DNS label: the slug becomes the Agent CR name and the
// HelmRelease/OCIRepository release name, so it must be a valid k8s object name
// (lowercase alphanumerics and hyphens, no leading/trailing hyphen, ≤63 chars).
const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function isValidSlug(slug: string): boolean {
  return slug.length <= 63 && DNS_LABEL_PATTERN.test(slug);
}

const NewAgentFormContext = createContext<NewAgentFormContextValue | undefined>(
  undefined,
);

export function NewAgentFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NewAgentFormState>(initialState);
  // The slug auto-derives from the name until the user edits it by hand.
  const [slugEdited, setSlugEdited] = useState(false);

  const value = useMemo<NewAgentFormContextValue>(() => {
    // The system prompt is intentionally NOT validated: the chart ships a
    // default agent.systemMessage, so an empty field just means "use the chart
    // default" (composeManifests omits it).
    const validationErrors: string[] = [];
    if (!state.name.trim()) {
      validationErrors.push('Name is required');
    }
    if (state.slug.trim()) {
      // The slug is emitted verbatim as a k8s object name — reject anything that
      // isn't a valid DNS-1123 label so the deploy can't fail late at apply time.
      if (!isValidSlug(state.slug)) {
        validationErrors.push(
          'Slug must be lowercase letters, numbers and hyphens (max 63 characters), e.g. my-agent',
        );
      }
    } else if (state.name.trim()) {
      // Only flag a missing slug once there's a name (it derives from the name).
      validationErrors.push('Slug is required');
    }
    if (!state.installation) {
      validationErrors.push('Select an installation');
    }
    if (!state.modelConfigName || !state.modelConfigNamespace) {
      validationErrors.push('Select a model');
    }
    const isComplete = validationErrors.length === 0;

    // Kept apart from `isComplete`: the step-1 fields decide whether the later
    // steps may render at all (a deep link without them goes back to step 1),
    // while the toolset is step 3's own output and gates only the way forward.
    const problems = toolsetProblems(state.toolset);
    const isToolsetChosen = state.toolset.length > 0 && problems.length === 0;

    return {
      state,
      setName: name =>
        setState(prev => ({
          ...prev,
          name,
          slug: slugEdited ? prev.slug : slugify(name),
        })),
      setSlug: slug => {
        setSlugEdited(true);
        setState(prev => ({ ...prev, slug }));
      },
      setDescription: description =>
        setState(prev => ({ ...prev, description })),
      // Changing the installation clears the model selection: ModelConfigs are
      // scoped to an installation, so the previous pick may not exist here.
      setInstallation: installation =>
        setState(prev => ({
          ...prev,
          installation,
          modelConfigName: undefined,
          modelConfigNamespace: undefined,
        })),
      selectModelConfig: (name, namespace) =>
        setState(prev => ({
          ...prev,
          modelConfigName: name,
          modelConfigNamespace: namespace,
        })),
      setSystemMessage: systemMessage =>
        setState(prev => ({ ...prev, systemMessage })),
      toggleToolsetSelector: selector =>
        setState(prev => ({
          ...prev,
          toolset: toggleSelector(prev.toolset, selector),
        })),
      setToolset: selectors =>
        setState(prev => ({ ...prev, toolset: [...selectors] })),
      isToolsetChosen,
      toolsetProblems: problems,
      toggleSkill: skill =>
        setState(prev => {
          const id = skillId(skill);
          const isSelected = prev.selectedSkills.some(s => skillId(s) === id);
          return {
            ...prev,
            selectedSkills: isSelected
              ? prev.selectedSkills.filter(s => skillId(s) !== id)
              : [...prev.selectedSkills, skill],
          };
        }),
      reset: () => {
        setSlugEdited(false);
        setState(initialState);
      },
      isComplete,
      validationErrors,
    };
  }, [state, slugEdited]);

  return (
    <NewAgentFormContext.Provider value={value}>
      {children}
    </NewAgentFormContext.Provider>
  );
}

export function useNewAgentForm(): NewAgentFormContextValue {
  const ctx = useContext(NewAgentFormContext);
  if (!ctx) {
    throw new Error(
      'useNewAgentForm must be used within a NewAgentFormProvider',
    );
  }
  return ctx;
}
