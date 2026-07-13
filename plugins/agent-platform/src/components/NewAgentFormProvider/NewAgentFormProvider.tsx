import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { slugify } from '../../lib/slugify';
import { DiscoveredSkill, skillId } from '../../lib/skills';

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
};

export type NewAgentFormContextValue = {
  state: NewAgentFormState;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setInstallation: (installation: string | undefined) => void;
  selectModelConfig: (name: string, namespace: string) => void;
  setSystemMessage: (systemMessage: string) => void;
  /**
   * Seeds the system prompt from the chart's default, but only while the user
   * hasn't edited it — so the resolved chart default fills the field without
   * clobbering a prompt the user has started writing.
   */
  applyDefaultSystemMessage: (systemMessage: string) => void;
  /** Adds the skill if not selected, removes it if already selected. */
  toggleSkill: (skill: DiscoveredSkill) => void;
  reset: () => void;
  /** True when every required field the review step needs is populated. */
  isComplete: boolean;
  /**
   * Human-readable labels of the required fields still missing, in form order.
   * Empty when the form is complete. Drives the submit-time validation feedback.
   */
  missingRequired: string[];
};

const initialState: NewAgentFormState = {
  name: '',
  slug: '',
  description: '',
  installation: undefined,
  modelConfigName: undefined,
  modelConfigNamespace: undefined,
  // Seeded from the chart's default at runtime (see applyDefaultSystemMessage).
  systemMessage: '',
  selectedSkills: [],
};

const NewAgentFormContext = createContext<NewAgentFormContextValue | undefined>(
  undefined,
);

export function NewAgentFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NewAgentFormState>(initialState);
  // The slug auto-derives from the name until the user edits it by hand.
  const [slugEdited, setSlugEdited] = useState(false);
  // The system prompt seeds from the chart default until the user edits it.
  const [systemMessageEdited, setSystemMessageEdited] = useState(false);

  const value = useMemo<NewAgentFormContextValue>(() => {
    // The system prompt is intentionally NOT required: the chart ships a default
    // agent.systemMessage, so an empty field just means "use the chart default"
    // (composeManifests omits it). Requiring it would wedge the form whenever the
    // chart's default couldn't be fetched to pre-fill the field.
    const missingRequired: string[] = [];
    if (!state.name.trim()) {
      missingRequired.push('Name');
    } else if (!state.slug.trim()) {
      missingRequired.push('Slug');
    }
    if (!state.installation) {
      missingRequired.push('Installation');
    }
    if (!state.modelConfigName || !state.modelConfigNamespace) {
      missingRequired.push('Model');
    }
    const isComplete = missingRequired.length === 0;

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
      setSystemMessage: systemMessage => {
        setSystemMessageEdited(true);
        setState(prev => ({ ...prev, systemMessage }));
      },
      applyDefaultSystemMessage: systemMessage =>
        setState(prev => {
          // Return the SAME state reference when nothing changes, so this never
          // triggers a re-render. Otherwise, since the caller re-runs it from an
          // effect on every render, a fresh object each time would loop forever
          // ("Maximum update depth exceeded").
          if (systemMessageEdited || prev.systemMessage === systemMessage) {
            return prev;
          }
          return { ...prev, systemMessage };
        }),
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
        setSystemMessageEdited(false);
        setState(initialState);
      },
      isComplete,
      missingRequired,
    };
  }, [state, slugEdited, systemMessageEdited]);

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
