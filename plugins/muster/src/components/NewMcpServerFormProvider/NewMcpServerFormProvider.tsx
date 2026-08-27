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
  sigv4Advisories,
  validateMcpServerAuth,
  validateMcpServerDetails,
  type FieldAvailability,
  type McpServerAuthMode,
  type McpServerDefinition,
  type McpServerMetaEntry,
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
  setSigv4Region: (region: string) => void;
  setSigv4Service: (service: string) => void;
  setSigv4RoleArn: (roleArn: string) => void;
  setMeta: (meta: McpServerMetaEntry[]) => void;
  /**
   * The CR name this wizard run has already registered, set by the review
   * step's successful create. While set, saving again is an update to that CR
   * (never a delete-and-recreate) and the technical name is locked — a rename
   * would target a different CR and orphan the registered one.
   */
  registeredName: string | undefined;
  setRegisteredName: (name: string | undefined) => void;
  reset: () => void;
  /** True when the form has no validation errors. */
  isComplete: boolean;
  /**
   * Human-readable validation problems, in form order. Empty when the form is
   * valid. Drives the Continue/submit-time feedback.
   */
  validationErrors: string[];
  /**
   * Problems in the Details step's fields only. The auth step's deep-link
   * guard checks these — not `validationErrors`, which would bounce a user
   * back to step 1 for an issuer they are typing on the auth step itself.
   */
  detailsErrors: string[];
  /**
   * Which auth fields this state may set, with an explanation for the ones it
   * may not — the CRD's auth mutual exclusions as disabled states.
   */
  authFields: {
    authorizationServer: FieldAvailability;
    scopes: FieldAvailability;
    requiredAudiences: FieldAvailability;
    sigv4: FieldAvailability;
  };
  /**
   * Non-blocking advisories about the chosen auth mode — a sigv4 server that
   * every rule accepts but that would fail at request time, or worse, answer
   * about the wrong AWS region. Shown alongside the fields, never gating
   * Continue.
   */
  authAdvisories: string[];
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
  const [registeredName, setRegisteredName] = useState<string | undefined>();

  const value = useMemo<NewMcpServerFormContextValue>(() => {
    const detailsErrors = validateMcpServerDetails(state);
    const validationErrors = [
      ...detailsErrors,
      ...validateMcpServerAuth(state),
    ];

    return {
      state,
      setName: name =>
        setState(prev => ({
          ...prev,
          name,
          // Once registered the slug is the CR's name and must not drift.
          slug: slugEdited || registeredName ? prev.slug : deriveSlug(name),
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
          sigv4Region: '',
          sigv4Service: '',
          sigv4RoleArn: '',
        })),
      setIssuer: issuer => setState(prev => ({ ...prev, issuer })),
      setScopes: scopes => setState(prev => ({ ...prev, scopes })),
      setRequiredAudiences: requiredAudiences =>
        setState(prev => ({ ...prev, requiredAudiences })),
      setSigv4Region: sigv4Region =>
        setState(prev => ({ ...prev, sigv4Region })),
      setSigv4Service: sigv4Service =>
        setState(prev => ({ ...prev, sigv4Service })),
      setSigv4RoleArn: sigv4RoleArn =>
        setState(prev => ({ ...prev, sigv4RoleArn })),
      setMeta: meta => setState(prev => ({ ...prev, meta })),
      registeredName,
      setRegisteredName,
      reset: () => {
        setSlugEdited(false);
        setRegisteredName(undefined);
        setState(emptyFormState);
      },
      isComplete: validationErrors.length === 0,
      validationErrors,
      detailsErrors,
      authFields: authFieldAvailability(state),
      authAdvisories: sigv4Advisories(state),
      definition: composeMcpServerDefinition(state),
    };
  }, [state, slugEdited, registeredName]);

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
