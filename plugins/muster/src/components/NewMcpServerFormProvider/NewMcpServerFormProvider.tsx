import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  authFieldAvailability,
  composeMcpServerDefinition,
  deriveSlug,
  emptyFormState,
  validateNewMcpServerForm,
  type FieldAvailability,
  type McpServerAuthMode,
  type McpServerDefinition,
  type McpServerTransport,
  type NewMcpServerFormState,
} from '../../lib/mcpServerDefinition';

export type NewMcpServerFormContextValue = {
  state: NewMcpServerFormState;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setInstallation: (installation: string | undefined) => void;
  setUrl: (url: string) => void;
  setTransport: (transport: McpServerTransport) => void;
  setAuthMode: (authMode: McpServerAuthMode) => void;
  setIssuer: (issuer: string) => void;
  setScopes: (scopes: string) => void;
  setRequiredAudiences: (requiredAudiences: string[]) => void;
  reset: () => void;
  /** True when the form has no validation errors. */
  isComplete: boolean;
  /**
   * Human-readable validation problems, in form order. Empty when the form is
   * valid. Drives the Continue/submit-time feedback.
   */
  validationErrors: string[];
  /**
   * Which auth fields this state may set, with an explanation for the ones it
   * may not — the CRD's auth mutual exclusions as disabled states.
   */
  authFields: {
    authorizationServer: FieldAvailability;
    scopes: FieldAvailability;
    requiredAudiences: FieldAvailability;
  };
  /** The definition passed to muster's validate/create tools. */
  definition: McpServerDefinition;
};

const NewMcpServerFormContext = createContext<
  NewMcpServerFormContextValue | undefined
>(undefined);

/**
 * Shared form state for the MCP server registration wizard (details → auth →
 * review & register → verify), modelled on agent creation's
 * `NewAgentFormProvider`: the steps are sub-routes, so the state and every
 * derived verdict live here rather than in a step.
 *
 * Composition and validation are pure functions in `lib/mcpServerDefinition` —
 * this only holds state and re-derives from it.
 */
export function NewMcpServerFormProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<NewMcpServerFormState>(emptyFormState);
  // The technical name auto-derives from the display name until the user edits
  // it by hand (same rule as agent creation).
  const [slugEdited, setSlugEdited] = useState(false);

  const value = useMemo<NewMcpServerFormContextValue>(() => {
    const validationErrors = validateNewMcpServerForm(state);

    return {
      state,
      setName: name =>
        setState(prev => ({
          ...prev,
          name,
          slug: slugEdited ? prev.slug : deriveSlug(name),
        })),
      setSlug: slug => {
        setSlugEdited(true);
        setState(prev => ({ ...prev, slug }));
      },
      setDescription: description =>
        setState(prev => ({ ...prev, description })),
      setInstallation: installation =>
        setState(prev => ({ ...prev, installation })),
      setUrl: url => setState(prev => ({ ...prev, url })),
      setTransport: transport => setState(prev => ({ ...prev, transport })),
      // Switching auth mode drops the other mode's fields: they are mutually
      // exclusive in the CRD, so keeping them would let a stale issuer or
      // audience list ride along into the composed definition.
      setAuthMode: authMode =>
        setState(prev => ({
          ...prev,
          authMode,
          issuer: '',
          scopes: '',
          requiredAudiences: [],
        })),
      setIssuer: issuer => setState(prev => ({ ...prev, issuer })),
      setScopes: scopes => setState(prev => ({ ...prev, scopes })),
      setRequiredAudiences: requiredAudiences =>
        setState(prev => ({ ...prev, requiredAudiences })),
      reset: () => {
        setSlugEdited(false);
        setState(emptyFormState);
      },
      isComplete: validationErrors.length === 0,
      validationErrors,
      authFields: authFieldAvailability(state),
      definition: composeMcpServerDefinition(state),
    };
  }, [state, slugEdited]);

  return (
    <NewMcpServerFormContext.Provider value={value}>
      {children}
    </NewMcpServerFormContext.Provider>
  );
}

export function useNewMcpServerForm(): NewMcpServerFormContextValue {
  const ctx = useContext(NewMcpServerFormContext);
  if (!ctx) {
    throw new Error(
      'useNewMcpServerForm must be used within a NewMcpServerFormProvider',
    );
  }
  return ctx;
}
