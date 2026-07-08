import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_SYSTEM_PROMPT } from '../../lib/agentDefaults';
import { slugify } from '../../lib/slugify';

export type NewAgentFormState = {
  name: string;
  slug: string;
  description: string;
  installation: string | undefined;
  modelConfigName: string | undefined;
  modelConfigNamespace: string | undefined;
  systemMessage: string;
};

export type NewAgentFormContextValue = {
  state: NewAgentFormState;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setInstallation: (installation: string | undefined) => void;
  selectModelConfig: (name: string, namespace: string) => void;
  setSystemMessage: (systemMessage: string) => void;
  reset: () => void;
  /** True when every required field the review step needs is populated. */
  isComplete: boolean;
};

const initialState: NewAgentFormState = {
  name: '',
  slug: '',
  description: '',
  installation: undefined,
  modelConfigName: undefined,
  modelConfigNamespace: undefined,
  systemMessage: DEFAULT_SYSTEM_PROMPT,
};

const NewAgentFormContext = createContext<NewAgentFormContextValue | undefined>(
  undefined,
);

export function NewAgentFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NewAgentFormState>(initialState);
  // The slug auto-derives from the name until the user edits it by hand.
  const [slugEdited, setSlugEdited] = useState(false);

  const value = useMemo<NewAgentFormContextValue>(() => {
    const isComplete = Boolean(
      state.name.trim() &&
      state.slug.trim() &&
      state.installation &&
      state.modelConfigName &&
      state.modelConfigNamespace &&
      state.systemMessage.trim(),
    );

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
      reset: () => {
        setSlugEdited(false);
        setState(initialState);
      },
      isComplete,
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
