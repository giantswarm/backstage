import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { MCPServer } from '../../lib/k8s';
import { toMcpServerDefinition } from '../../lib/gitops';
import {
  authAnswerOf,
  authFieldAvailability,
  composeMcpServerDefinition,
  deriveSlug,
  emptyAuthAnswer,
  emptyFormState,
  formStateFromServer,
  hasUserInput,
  mergeOntoExisting,
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
   * The CR name this wizard run edits: the server an Edit started from, or the
   * one the review step's successful create registered. While set, saving is
   * an update to that CR (never a delete-and-recreate) and the technical name
   * is locked — a rename would target a different CR and orphan this one.
   */
  registeredName: string | undefined;
  /**
   * The installation the registered server lives on, set together with
   * {@link registeredName}. The form's installation stays pinned to it: an
   * update must reach this server, not whichever installation the header
   * selector shows by now.
   */
  registeredInstallation: string | undefined;
  /**
   * How this run last wrote the server: `create` after registering it,
   * `update` after saving changes to it. Undefined until the first save.
   */
  lastSave: 'create' | 'update' | undefined;
  /**
   * Epoch-ms of that last save. A server list read before it still shows the
   * server as it was, so the verify step waits for a newer read.
   */
  lastSaveAt: number | undefined;
  /**
   * Records a successful create or update of `definition`: the server is now
   * registered under its name on the form's installation, and later saves
   * (the verify step's "Edit details" loop) are updates laid over exactly what
   * was saved — not over the server as it was when the edit started.
   */
  markSaved: (definition: McpServerDefinition) => void;
  /**
   * Seeds the wizard from an already-registered server, so its "Edit" opens
   * the registration form pre-filled. Saving is then an update to that server
   * that keeps every field the wizard does not model. An unfinished new
   * registration is set aside, and {@link reset} brings it back.
   */
  startEdit: (server: MCPServer) => void;
  /**
   * Ends this run: back to the registration draft an edit set aside, or to an
   * empty form.
   */
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
  /** The definition passed to muster's validate/create/update tools. */
  definition: McpServerDefinition;
};

const NewMcpServerFormContext = createContext<
  NewMcpServerFormContextValue | undefined
>(undefined);

/** The registered server a run edits, and the form state it reads back as. */
type EditBase = {
  definition: Record<string, unknown>;
  form: NewMcpServerFormState;
};

/** An unfinished registration an edit set aside. */
type Draft = { state: NewMcpServerFormState; slugEdited: boolean };

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
  const [registeredInstallation, setRegisteredInstallation] = useState<
    string | undefined
  >();
  const [lastSave, setLastSave] = useState<'create' | 'update'>();
  const [lastSaveAt, setLastSaveAt] = useState<number>();
  // The registered server as last read or saved: the base the wizard's
  // definition is laid over, so an update keeps what it cannot show.
  const [base, setBase] = useState<EditBase>();

  // The run-level actions below are stable (the servers page memoizes its
  // header actions on them), so they read the current values from here.
  const latest = useRef({ state, slugEdited, registeredName });
  latest.current = { state, slugEdited, registeredName };
  const draft = useRef<Draft>();

  const markSaved = useCallback((saved: McpServerDefinition) => {
    const current = latest.current;
    setLastSave(current.registeredName ? 'update' : 'create');
    setLastSaveAt(Date.now());
    setRegisteredName(saved.name);
    setRegisteredInstallation(current.state.installation);
    setBase({ definition: saved, form: current.state });
  }, []);

  const startEdit = useCallback((server: MCPServer) => {
    const current = latest.current;
    // Only a registration in progress is a draft; an edit replaced by another
    // edit has nothing to come back to.
    if (!current.registeredName && hasUserInput(current.state)) {
      draft.current = {
        state: current.state,
        slugEdited: current.slugEdited,
      };
    }
    const form = formStateFromServer(server);
    setSlugEdited(true);
    setRegisteredName(server.getName());
    setRegisteredInstallation(server.cluster);
    setLastSave(undefined);
    setLastSaveAt(undefined);
    setBase({ definition: toMcpServerDefinition(server), form });
    setState(form);
  }, []);

  const reset = useCallback(() => {
    const restored = draft.current;
    draft.current = undefined;
    setSlugEdited(restored?.slugEdited ?? false);
    setRegisteredName(undefined);
    setRegisteredInstallation(undefined);
    setLastSave(undefined);
    setLastSaveAt(undefined);
    setBase(undefined);
    setState(restored?.state ?? emptyFormState);
  }, []);

  const value = useMemo<NewMcpServerFormContextValue>(() => {
    // The display name only derives the technical name, which an edit locks —
    // so the Details step hides it then, and it must not block the edit.
    const detailsErrors = validateMcpServerDetails(
      registeredName && !state.name.trim()
        ? { ...state, name: registeredName }
        : state,
    );
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
      // audience list ride along into the composed definition. Re-picking the
      // current mode (a click on the already-selected card) is no switch and
      // keeps what is filled in; switching back to the registered server's own
      // mode brings its values back rather than an empty answer.
      setAuthMode: authMode =>
        setState(prev => {
          if (prev.authMode === authMode) {
            return prev;
          }
          const answer =
            base && base.form.authMode === authMode
              ? authAnswerOf(base.form)
              : emptyAuthAnswer;
          return { ...prev, authMode, ...answer };
        }),
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
      registeredInstallation,
      lastSave,
      lastSaveAt,
      markSaved,
      startEdit,
      reset,
      isComplete: validationErrors.length === 0,
      validationErrors,
      detailsErrors,
      authFields: authFieldAvailability(state),
      authAdvisories: sigv4Advisories(state),
      definition: base
        ? mergeOntoExisting(base.definition, composeMcpServerDefinition(state))
        : composeMcpServerDefinition(state),
    };
  }, [
    state,
    slugEdited,
    registeredName,
    registeredInstallation,
    lastSave,
    lastSaveAt,
    base,
    markSaved,
    startEdit,
    reset,
  ]);

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
