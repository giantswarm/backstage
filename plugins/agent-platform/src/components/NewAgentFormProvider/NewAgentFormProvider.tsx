import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSessionDraft } from '@giantswarm/backstage-plugin-ui-react';

import type {
  AgentManagerAgent,
  AgentPluginEntry,
  AgentSkillEntry,
  WriteMode,
} from '../../lib/agentManager';
import {
  changedFields,
  editStateOfForm,
  skillEntryKey,
} from '../../lib/agentEdit';
import { slugify } from '../../lib/slugify';
import { defaultTenant } from '../../lib/tenants';
import { systemMessageProblem } from '../../lib/systemMessage';
import { egressProblem, parseEgressText } from '../../lib/egress';
import { isCodingRuntime, type HarnessChoice } from '../../lib/harnesses';
import { DiscoveredSkill, skillId } from '../../lib/skills';
import {
  DiscoveredPlugin,
  pluginEntryKey,
  pluginId,
  SelectedPlugin,
} from '../../lib/plugins';
import { withoutSignInTool } from '../../lib/signInTool';
import {
  normalizeSelection,
  toggleSelector,
  toolsetProblems,
} from '../../lib/toolset';

export type NewAgentFormState = {
  name: string;
  slug: string;
  description: string;
  installation: string | undefined;
  /**
   * Creating only: the tenants (namespaces) on the installation in which the
   * person may create an agent, as agent-manager's `get_info` answers them
   * for the caller (`namespaces.managed`, a `SelfSubjectAccessReview` per
   * namespace). `undefined` until it has answered.
   */
  tenantChoices?: string[];
  /**
   * Creating only: agent-manager's `get_info` could not be read on the
   * installation, so there are no {@link tenantChoices} to pick from. Not
   * kept in the draft.
   */
  tenantChoicesFailed?: boolean;
  /**
   * Creating only: the tenant, one of {@link tenantChoices}, the agent is
   * created in -- the namespace its model, Harness and release live in.
   */
  tenant?: string;
  modelConfigName: string | undefined;
  modelConfigNamespace: string | undefined;
  /**
   * The picked model's display name, for the plain summaries (the review
   * step's Model row). Undefined falls back to the ModelConfig's name.
   */
  modelDisplayName: string | undefined;
  /**
   * The Harness the agent runs on, when the person picked one other than the
   * platform Harness. Undefined is the platform Harness: `harness` is then
   * left out of the request and agent-manager composes its own.
   */
  harness: HarnessChoice | undefined;
  /**
   * The name of a picked Harness a later installation or model change dropped,
   * until the person picks a runtime again: what tells them the pick is gone.
   */
  droppedHarness: string | undefined;
  systemMessage: string;
  /**
   * Extra HTTP(S) origins the agent may reach, one per line as typed
   * (`Agent.spec.egress`). Empty means none beyond what its revision compiles.
   */
  egressText: string;
  /**
   * Names of the namespace's EgressPolicies the agent picks
   * (`Agent.spec.egressPolicyRefs`), in the order picked. Always empty on a
   * coding Harness, which reaches its platform list only.
   */
  egressPolicyRefs: string[];
  /**
   * The extra origins and EgressPolicies a move to a coding Harness took out,
   * which reaches its platform list only: what tells the person they are
   * gone, once. Replaced by the next Harness pick; never kept in a draft.
   */
  droppedEgress?: DroppedEgress;
  /**
   * The agent runs on a coding Harness, whose egress the platform sets: the
   * form shows no Extra egress origins, so they are not checked, and creating
   * drops what was entered (`droppedEgress`). Set by the details step once
   * the runtime is known (`setEgressSetByPlatform`); never kept in a draft.
   */
  egressSetByPlatform?: boolean;
  /**
   * The name of the workspace the agent's Sessions start in unless the person
   * picks another or none (written as `<namespace>/<name>`, see
   * `lib/defaultWorkspace`). `''` for none, the start.
   */
  defaultWorkspace: string;
  /**
   * Skills the user picked, in selection order, each with the commit the
   * skills step showed — the pin agent-manager writes. Optional — may be empty.
   */
  selectedSkills: DiscoveredSkill[];
  /**
   * Editing only: the agent's skills no configured repository lists (another
   * repository, an OCI digest), kept exactly as pinned until removed. Always
   * empty when creating.
   */
  keptSkills: AgentSkillEntry[];
  /**
   * The plugins the person picked, in selection order, each at the commit the
   * skills step showed (an edited agent's at its pin). Optional.
   */
  selectedPlugins: SelectedPlugin[];
  /**
   * Editing only: the agent's plugins no configured repository lists, kept
   * exactly as pinned until removed. Always empty when creating.
   */
  keptPlugins: AgentPluginEntry[];
  /**
   * The agent's toolset as selected: inline selectors (`preset:`, `server:`,
   * `workflow:`, `tool:`), in selection order. Starts empty on purpose —
   * nothing the author did not consciously add — and empty is a complete
   * answer: no tools. The wizard declares that as `preset:none`
   * (`declaredToolset`), so `preset:none` itself never sits in this list.
   */
  toolset: string[];
  /**
   * The Tools step's *Nothing outside the chat*: the toolset is empty and the
   * step's selection below is turned off until another access level is
   * picked. Declared like any empty selection (`preset:none`); while editing,
   * it also counts as a change for an agent that declares no toolset.
   */
  toolsChatOnly?: boolean;
  /**
   * The preset the Tools step compacts the toolset against (B1, R2-1): the
   * one the toolset was built on, kept once a change wrote it out, so undoing
   * that change collapses back to it. Held here rather than in the step, so a
   * step round trip keeps it as long as the draft (R2 re-review N2). Not part
   * of the agent: nothing saves it.
   */
  toolsetBase?: string;
  /**
   * The person removed the sign-in tool the wizard adds for a connector that
   * needs it (`lib/signInTool`), so it is not added again. Set only by that
   * removal on the Tools step; *Add it back*, the last such connector going,
   * or *Nothing outside the chat* clears it.
   */
  signInToolDeclined?: boolean;
};

/** What a move to a coding Harness took out of the form, as entered. */
export type DroppedEgress = {
  origins: string[];
  policies: string[];
};

/**
 * The wizard in edit mode: the agent it changes, as agent-manager read it when
 * the wizard opened (the baseline the review compares against), and how a save
 * lands. The technical name, installation, namespace and Harness are fixed.
 */
export type AgentWizardEdit = {
  agent: AgentManagerAgent;
  installation: string;
  /** `apply` saves live; `commit` (an agent applied from git) opens a PR. */
  writeMode: WriteMode;
  /** The agent's page: where Close leads and a saved change lands. */
  detailHref: string | undefined;
};

export type NewAgentFormContextValue = {
  state: NewAgentFormState;
  /** Set when the wizard edits an existing agent rather than creating one. */
  edit: AgentWizardEdit | undefined;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setInstallation: (installation: string | undefined) => void;
  /**
   * Sets {@link NewAgentFormState.tenantChoices}. The tenant held stays when
   * it is still a choice; else the person's own last pick, when it is one
   * (it survives an environment change); else the first choice offered.
   */
  setTenantChoices: (choices: string[]) => void;
  /** Sets {@link NewAgentFormState.tenantChoicesFailed}. */
  setTenantChoicesFailed: (failed: boolean) => void;
  /** Picks the tenant; a model of another namespace is dropped. */
  selectTenant: (tenant: string) => void;
  selectModelConfig: (
    name: string,
    namespace: string,
    displayName?: string,
  ) => void;
  /** Undefined picks the platform Harness. */
  selectHarness: (harness: HarnessChoice | undefined) => void;
  setSystemMessage: (systemMessage: string) => void;
  setEgressText: (egressText: string) => void;
  /** Sets {@link NewAgentFormState.egressSetByPlatform}. */
  setEgressSetByPlatform: (setByPlatform: boolean) => void;
  /** Replaces the picked EgressPolicies (names, in the order picked). */
  setEgressPolicyRefs: (names: string[]) => void;
  /** `''` removes the default workspace. */
  setDefaultWorkspace: (defaultWorkspace: string) => void;
  /** Adds the skill if not selected, removes it if already selected. */
  toggleSkill: (skill: DiscoveredSkill) => void;
  /** Editing only: drops one of the kept skills (see `keptSkills`). */
  removeKeptSkill: (skill: AgentSkillEntry) => void;
  /** A Claude Code plugin: adds it if not picked, removes it if picked. */
  togglePlugin: (plugin: DiscoveredPlugin) => void;
  /**
   * An Agent Plugins package: enables or disables one of its skills. The
   * package is picked while at least one of its skills is enabled.
   */
  togglePluginSkill: (plugin: DiscoveredPlugin, skill: string) => void;
  /** Editing only: drops one of the kept plugins (see `keptPlugins`). */
  removeKeptPlugin: (plugin: AgentPluginEntry) => void;
  /**
   * Adds the selector if absent, removes it if present. `preset:full` replaces
   * the whole selection and adding anything else drops it; `preset:none` clears
   * the selection, since no tools is the empty selection (see `toggleSelector`).
   */
  toggleToolsetSelector: (selector: string) => void;
  /**
   * Replaces the whole selection — start from an existing agent's toolset, or
   * clear it. `preset:none` in the list is dropped: it is the empty selection.
   */
  setToolset: (selectors: string[]) => void;
  /**
   * *Nothing outside the chat*: clears the toolset and turns the step's
   * selection off (`toolsChatOnly`). Any other toolset change turns it on
   * again.
   */
  setToolsChatOnly: () => void;
  /** Sets or clears {@link NewAgentFormState.toolsetBase}. */
  setToolsetBase: (base: string | undefined) => void;
  /** Sets {@link NewAgentFormState.signInToolDeclined}. */
  setSignInToolDeclined: (declined: boolean) => void;
  /**
   * True when the toolset can be applied: none of the selectors malformed and
   * no more than the inline cap. The empty selection is valid — it is no tools.
   * What the Tools step's Continue and the review page's deploy gate on.
   */
  isToolsetValid: boolean;
  /** Why the toolset cannot be applied, empty when it can. */
  toolsetProblems: string[];
  reset: () => void;
  /**
   * The kept draft has been looked for (see `persistDraft`): until then the
   * create steps wait, so a reload on a later step is not sent back to the
   * first one before its draft is in. Always true without a draft.
   */
  isDraftLoaded: boolean;
  /**
   * The form came back with a kept draft and the person has neither started
   * over nor closed the note that says so, nor moved on from the step it
   * showed on.
   */
  isDraftRestored: boolean;
  /**
   * The wizard step the note about the restored draft showed on, once a step
   * claimed it (`claimDraftNotice`): another step closes it instead.
   */
  draftNoticeStep: string | undefined;
  /** Records the step the note shows on; the first claim stands. */
  claimDraftNotice: (step: string) => void;
  /** Closes the note about the restored draft; the draft stays. */
  dismissDraftNotice: () => void;
  /**
   * Drops the kept draft and empties the form: "Start over", "Discard
   * changes", and a created agent.
   */
  discardDraft: () => void;
  /**
   * Drops the kept draft but keeps the form as it is: a pull request was
   * proposed, and the review step still shows it. A further change is kept
   * again.
   */
  clearSavedDraft: () => void;
  /**
   * Whether leaving now would lose the person's work, so the wizard's Close
   * and Cancel ask first. Editing: any change the review would save.
   * Creating: anything typed or chosen beyond the start — the environment
   * and model are left out, since the form picks those itself.
   */
  isDirty: boolean;
  /** True when the form has no validation errors. */
  isComplete: boolean;
  /**
   * Human-readable validation problems, in form order. Empty when the form is
   * valid. Drives the submit-time feedback.
   */
  validationErrors: string[];
  /**
   * The same problems by the field each belongs to, for the per-field
   * feedback: the field shows its own message once a Continue is blocked.
   */
  fieldErrors: NewAgentFieldErrors;
};

/** The step-1 fields a validation problem can belong to. */
export type NewAgentField =
  | 'name'
  | 'systemMessage'
  | 'installation'
  | 'tenant'
  | 'model'
  | 'slug'
  | 'egress';

export type NewAgentFieldErrors = Partial<Record<NewAgentField, string>>;

const initialState: NewAgentFormState = {
  name: '',
  slug: '',
  description: '',
  installation: undefined,
  modelConfigName: undefined,
  modelConfigNamespace: undefined,
  modelDisplayName: undefined,
  harness: undefined,
  droppedHarness: undefined,
  // Empty means "use the chart default": the spec sent to agent-manager omits
  // it (agentSpecOf), and agent-manager keeps the chart's default prompt.
  systemMessage: '',
  egressText: '',
  egressPolicyRefs: [],
  defaultWorkspace: '',
  selectedSkills: [],
  keptSkills: [],
  selectedPlugins: [],
  keptPlugins: [],
  toolset: [],
  // A new agent starts at the Tools step's *Nothing outside the chat* (T81):
  // nothing the author did not consciously add.
  toolsChatOnly: true,
};

// RFC1123 DNS label: the slug becomes the Agent name and the
// HelmRelease name, so it must be a valid k8s object name
// (lowercase alphanumerics and hyphens, no leading/trailing hyphen, ≤63 chars).
const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function isValidSlug(slug: string): boolean {
  return slug.length <= 63 && DNS_LABEL_PATTERN.test(slug);
}

/**
 * What a create draft keeps (`useSessionDraft`): everything entered and picked
 * on the four steps, as plain data. The tenant choices are left out -- they are
 * the installation's answer, read again -- and the form holds no secret or
 * token to leave out.
 */
type NewAgentDraft = {
  state: Omit<
    NewAgentFormState,
    'tenantChoices' | 'droppedEgress' | 'egressSetByPlatform'
  >;
  slugEdited: boolean;
};

/** Bumped when {@link NewAgentDraft}'s shape changes: an older draft is dropped. */
const DRAFT_VERSION = 1;

/** The draft's name in the storage key, with the person's entity ref. */
export const NEW_AGENT_DRAFT_NAME = 'agent-platform-new-agent';

/** A new agent's form holds work of the person's own (see `isDirty`). */
function hasCreateInput(state: NewAgentFormState): boolean {
  return (
    [
      state.name,
      state.slug,
      state.description,
      state.systemMessage,
      state.egressText,
    ].some(text => text.trim() !== '') ||
    state.harness !== undefined ||
    state.egressPolicyRefs.length > 0 ||
    state.defaultWorkspace !== '' ||
    state.selectedSkills.length > 0 ||
    state.selectedPlugins.length > 0 ||
    state.toolset.length > 0 ||
    state.toolsChatOnly !== initialState.toolsChatOnly
  );
}

/**
 * The state with `tenant` picked: the agent's namespace, so a model (and the
 * Harness it brought) of another namespace is dropped, and the model picker
 * preselects the tenant's default instead. EgressPolicies are the namespace's
 * own, so the picked ones go too.
 */
function withTenant(
  state: NewAgentFormState,
  tenant: string | undefined,
): NewAgentFormState {
  if (state.tenant === tenant) {
    return state;
  }
  if (!state.modelConfigNamespace || state.modelConfigNamespace === tenant) {
    return { ...state, tenant, egressPolicyRefs: [] };
  }
  return {
    ...state,
    tenant,
    egressPolicyRefs: [],
    modelConfigName: undefined,
    modelConfigNamespace: undefined,
    modelDisplayName: undefined,
    harness: undefined,
    droppedHarness: state.harness?.name ?? state.droppedHarness,
  };
}

/**
 * The state with its extra origins and EgressPolicies taken out, and what was
 * taken out recorded for the notice; unchanged when there was none.
 */
function withEgressDropped(state: NewAgentFormState): NewAgentFormState {
  const origins = parseEgressText(state.egressText);
  const policies = state.egressPolicyRefs;
  if (origins.length === 0 && policies.length === 0) {
    return state;
  }
  return {
    ...state,
    egressText: '',
    egressPolicyRefs: [],
    droppedEgress: { origins, policies },
  };
}

/**
 * The agent as the form compares an edit with: without the sign-in tool,
 * which the form leaves to the Tools step (`formStateOfAgent`), so opening the
 * editor is not a change of the person's.
 */
function baselineOf(agent: AgentManagerAgent): AgentManagerAgent {
  return agent.toolset
    ? { ...agent, toolset: withoutSignInTool(agent.toolset) }
    : agent;
}

const NewAgentFormContext = createContext<NewAgentFormContextValue | undefined>(
  undefined,
);

/**
 * The wizard's state, shared by its steps. Creating starts empty; editing
 * (`edit` with `initialState`, see `EditAgentPage`) starts from the agent and
 * keeps its technical name fixed — renaming never re-derives it.
 *
 * With `persistDraft`, creating keeps a draft in the tab's `sessionStorage`
 * per person (`useSessionDraft`), so a reload, a sign-in redirect, Back or a
 * link followed in the same tab does not lose the input: the form comes back
 * with it. Editing never keeps one; it starts from the agent each time.
 */
export function NewAgentFormProvider({
  children,
  edit,
  initialState: seed = initialState,
  persistDraft = false,
}: {
  children: ReactNode;
  edit?: AgentWizardEdit;
  initialState?: NewAgentFormState;
  persistDraft?: boolean;
}) {
  const [state, setState] = useState<NewAgentFormState>(seed);
  // The tenant the person picked themselves, so another environment that
  // offers it too picks it again instead of its own first.
  const ownTenantPick = useRef<string>();
  // The slug auto-derives from the name until the user edits it by hand — and
  // never while editing: an existing agent's technical name cannot change.
  const [slugEdited, setSlugEdited] = useState(Boolean(edit));
  const [draftNoticeStep, setDraftNoticeStep] = useState<string>();

  const isDirtyCreate = !edit && hasCreateInput(state);
  const draftValue = useMemo<NewAgentDraft>(() => {
    // The notice of a removal is said once, and whether the platform sets the
    // egress is read again, like the tenant choices.
    const {
      tenantChoices: _choices,
      tenantChoicesFailed: _failed,
      droppedEgress: _dropped,
      egressSetByPlatform: _setByPlatform,
      ...kept
    } = state;
    return { state: kept, slugEdited };
  }, [state, slugEdited]);
  const onRestore = useCallback((draft: NewAgentDraft) => {
    setState({ ...initialState, ...draft.state, tenantChoices: undefined });
    setSlugEdited(draft.slugEdited);
  }, []);
  const draft = useSessionDraft<NewAgentDraft>({
    name: persistDraft && !edit ? NEW_AGENT_DRAFT_NAME : undefined,
    value: draftValue,
    isDirty: isDirtyCreate,
    version: DRAFT_VERSION,
    onRestore,
  });
  const {
    clear: clearDraft,
    isLoaded: isDraftLoaded,
    wasRestored: isDraftRestored,
    dismissRestored: dismissDraftNotice,
  } = draft;

  const value = useMemo<NewAgentFormContextValue>(() => {
    // An empty system prompt is valid: the chart ships a default
    // agent.systemMessage, so an empty field means "use the chart default"
    // (agentSpecOf omits it). Only its length is checked.
    const fieldErrors: NewAgentFieldErrors = {};
    fieldErrors.systemMessage = systemMessageProblem(state.systemMessage);
    // Not shown on a coding Harness, so not checked there.
    fieldErrors.egress = state.egressSetByPlatform
      ? undefined
      : egressProblem(parseEgressText(state.egressText));
    if (!state.name.trim()) {
      fieldErrors.name = 'Enter a name for the agent.';
    }
    if (state.slug.trim()) {
      // The slug is emitted verbatim as a k8s object name — reject anything that
      // isn't a valid DNS-1123 label so the deploy can't fail late at apply time.
      if (!isValidSlug(state.slug)) {
        fieldErrors.slug =
          'Technical name must be lowercase letters, numbers and hyphens (max 63 characters), e.g. my-agent';
      }
    } else if (state.name.trim()) {
      // Only flag a missing slug once there's a name (it derives from the name).
      fieldErrors.slug = 'Enter a technical name.';
    }
    if (!state.installation) {
      fieldErrors.installation = 'Choose an environment.';
    }
    // No agent is created without its place: Continue waits for agent-manager
    // to say where the person may create, and stops where it could not.
    if (!edit && state.installation && !state.tenant) {
      if (state.tenantChoices?.length === 0) {
        fieldErrors.tenant = `You may not create agents on ${state.installation}. Choose another environment, or ask your platform team for the agent-platform:editor role.`;
      } else if (state.tenantChoices) {
        // A guard only: a choice is always picked once there are choices
        // (`setTenantChoices`).
        fieldErrors.tenant = 'Choose an organization.';
      } else if (state.tenantChoicesFailed) {
        fieldErrors.tenant = 'Could not read where you may create agents.';
      } else {
        fieldErrors.tenant = 'Still reading where you may create agents.';
      }
    }
    if (!state.modelConfigName || !state.modelConfigNamespace) {
      fieldErrors.model = 'Choose a model.';
    }
    // The list keeps its historical order (the summary's, and the tests').
    const validationErrors = (
      [
        'systemMessage',
        'egress',
        'name',
        'slug',
        'installation',
        'tenant',
        'model',
      ] as const
    )
      .map(field => fieldErrors[field])
      .filter((error): error is string => Boolean(error));
    const isComplete = validationErrors.length === 0;

    // Kept apart from `isComplete`: the step-1 fields decide whether the later
    // steps may render at all (a deep link without them goes back to step 1),
    // while the toolset is step 3's own output and gates only the way forward —
    // and only when it cannot be applied; nothing selected is no tools.
    const problems = toolsetProblems(state.toolset);
    const isToolsetValid = problems.length === 0;

    const isDirty = edit
      ? changedFields(
          baselineOf(edit.agent),
          editStateOfForm(edit.agent, state),
        ).length > 0
      : isDirtyCreate;
    const reset = () => {
      setSlugEdited(Boolean(edit));
      setState(seed);
    };

    return {
      state,
      edit,
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
      // Changing the installation clears the model and Harness selections:
      // both are scoped to an installation, so the previous pick may not exist
      // here.
      setInstallation: installation =>
        setState(prev => ({
          ...prev,
          installation,
          tenantChoices: undefined,
          tenantChoicesFailed: undefined,
          tenant: undefined,
          defaultWorkspace: '',
          egressPolicyRefs: [],
          modelConfigName: undefined,
          modelConfigNamespace: undefined,
          modelDisplayName: undefined,
          harness: undefined,
          droppedHarness: prev.harness?.name ?? prev.droppedHarness,
        })),
      setTenantChoices: choices =>
        setState(prev => {
          if (
            prev.tenantChoices?.join(',') === choices.join(',') &&
            (prev.tenant === undefined
              ? choices.length === 0
              : choices.includes(prev.tenant))
          ) {
            return prev;
          }
          let tenant = prev.tenant;
          if (!tenant || !choices.includes(tenant)) {
            const own = ownTenantPick.current;
            tenant =
              own && choices.includes(own) ? own : defaultTenant(choices);
          }
          return withTenant(
            { ...prev, tenantChoices: choices, tenantChoicesFailed: undefined },
            tenant,
          );
        }),
      setTenantChoicesFailed: failed =>
        setState(prev =>
          Boolean(prev.tenantChoicesFailed) === failed
            ? prev
            : { ...prev, tenantChoicesFailed: failed || undefined },
        ),
      selectTenant: tenant => {
        ownTenantPick.current = tenant;
        setState(prev => withTenant(prev, tenant));
      },
      // The ModelConfig's namespace is the agent's, and an Agent names a
      // Harness of its own namespace, so a model in another namespace drops
      // the Harness pick. A model outside the picked tenant is not taken: a
      // preselection made before the tenant was known would create the agent
      // in the model's namespace instead (#3189).
      selectModelConfig: (name, namespace, displayName) =>
        setState(prev => {
          if (prev.tenant !== undefined && prev.tenant !== namespace) {
            return prev;
          }
          return prev.modelConfigNamespace === namespace
            ? { ...prev, modelConfigName: name, modelDisplayName: displayName }
            : {
                ...prev,
                modelConfigName: name,
                modelConfigNamespace: namespace,
                modelDisplayName: displayName,
                egressPolicyRefs: [],
                harness: undefined,
                droppedHarness: prev.harness?.name ?? prev.droppedHarness,
              };
        }),
      // A coding Harness reaches its platform list only: typed origins and
      // picked EgressPolicies go with the move to one, and the form says so.
      selectHarness: harness =>
        setState(prev => {
          const next = {
            ...prev,
            harness,
            droppedHarness: undefined,
            droppedEgress: undefined,
          };
          return isCodingRuntime(harness?.runtime)
            ? withEgressDropped(next)
            : next;
        }),
      // The same once the runtime is read, for a Harness picked or defaulted
      // before it was: the platform Harness may be a coding one. An edit
      // never drops the agent's egress; it only stops checking it.
      setEgressSetByPlatform: setByPlatform =>
        setState(prev => {
          if (Boolean(prev.egressSetByPlatform) === setByPlatform) {
            return prev;
          }
          const next = {
            ...prev,
            egressSetByPlatform: setByPlatform || undefined,
          };
          return setByPlatform && !edit ? withEgressDropped(next) : next;
        }),
      setSystemMessage: systemMessage =>
        setState(prev => ({ ...prev, systemMessage })),
      setEgressText: egressText => setState(prev => ({ ...prev, egressText })),
      setEgressPolicyRefs: egressPolicyRefs =>
        setState(prev => ({ ...prev, egressPolicyRefs })),
      setDefaultWorkspace: defaultWorkspace =>
        setState(prev => ({ ...prev, defaultWorkspace })),
      toggleToolsetSelector: selector =>
        setState(prev => ({
          ...prev,
          toolset: toggleSelector(prev.toolset, selector),
          toolsChatOnly: false,
        })),
      setToolset: selectors =>
        setState(prev => ({
          ...prev,
          toolset: normalizeSelection(selectors),
          toolsChatOnly: false,
        })),
      setToolsChatOnly: () =>
        setState(prev => ({
          ...prev,
          toolset: [],
          toolsChatOnly: true,
          signInToolDeclined: undefined,
        })),
      setToolsetBase: toolsetBase =>
        setState(prev =>
          prev.toolsetBase === toolsetBase ? prev : { ...prev, toolsetBase },
        ),
      setSignInToolDeclined: declined =>
        setState(prev =>
          Boolean(prev.signInToolDeclined) === declined
            ? prev
            : { ...prev, signInToolDeclined: declined || undefined },
        ),
      isToolsetValid,
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
      removeKeptSkill: skill =>
        setState(prev => ({
          ...prev,
          keptSkills: prev.keptSkills.filter(
            kept => skillEntryKey(kept) !== skillEntryKey(skill),
          ),
        })),
      togglePlugin: plugin =>
        setState(prev => {
          const id = pluginId(plugin);
          const isSelected = prev.selectedPlugins.some(
            selected => pluginId(selected.plugin) === id,
          );
          return {
            ...prev,
            selectedPlugins: isSelected
              ? prev.selectedPlugins.filter(
                  selected => pluginId(selected.plugin) !== id,
                )
              : [...prev.selectedPlugins, { plugin, skills: [] }],
          };
        }),
      togglePluginSkill: (plugin, skill) =>
        setState(prev => {
          const id = pluginId(plugin);
          const current = prev.selectedPlugins.find(
            selected => pluginId(selected.plugin) === id,
          );
          if (!current) {
            return {
              ...prev,
              selectedPlugins: [
                ...prev.selectedPlugins,
                { plugin, skills: [skill] },
              ],
            };
          }
          const skills = current.skills.includes(skill)
            ? current.skills.filter(name => name !== skill)
            : [...current.skills, skill];
          return {
            ...prev,
            // A package with nothing enabled loads nothing: it is unpicked.
            selectedPlugins:
              skills.length === 0
                ? prev.selectedPlugins.filter(selected => selected !== current)
                : prev.selectedPlugins.map(selected =>
                    selected === current ? { ...selected, skills } : selected,
                  ),
          };
        }),
      removeKeptPlugin: plugin =>
        setState(prev => ({
          ...prev,
          keptPlugins: prev.keptPlugins.filter(
            kept => pluginEntryKey(kept) !== pluginEntryKey(plugin),
          ),
        })),
      reset,
      isDraftLoaded,
      isDraftRestored,
      draftNoticeStep,
      claimDraftNotice: step =>
        setDraftNoticeStep(prev => (prev === undefined ? step : prev)),
      dismissDraftNotice,
      discardDraft: () => {
        clearDraft();
        reset();
      },
      clearSavedDraft: clearDraft,
      isDirty,
      isComplete,
      validationErrors,
      fieldErrors,
    };
  }, [
    state,
    slugEdited,
    edit,
    seed,
    isDirtyCreate,
    isDraftLoaded,
    isDraftRestored,
    draftNoticeStep,
    dismissDraftNotice,
    clearDraft,
  ]);

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
