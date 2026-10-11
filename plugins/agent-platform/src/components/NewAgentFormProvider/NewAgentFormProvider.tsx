import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  AgentManagerAgent,
  AgentSkillEntry,
  WriteMode,
} from '../../lib/agentManager';
import {
  changedFields,
  editStateOfForm,
  skillEntryKey,
} from '../../lib/agentEdit';
import { slugify } from '../../lib/slugify';
import { systemMessageProblem } from '../../lib/systemMessage';
import { egressProblem, parseEgressText } from '../../lib/egress';
import type { HarnessChoice } from '../../lib/harnesses';
import { DiscoveredSkill, skillId } from '../../lib/skills';
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
  selectModelConfig: (
    name: string,
    namespace: string,
    displayName?: string,
  ) => void;
  /** Undefined picks the platform Harness. */
  selectHarness: (harness: HarnessChoice | undefined) => void;
  setSystemMessage: (systemMessage: string) => void;
  setEgressText: (egressText: string) => void;
  /** Adds the skill if not selected, removes it if already selected. */
  toggleSkill: (skill: DiscoveredSkill) => void;
  /** Editing only: drops one of the kept skills (see `keptSkills`). */
  removeKeptSkill: (skill: AgentSkillEntry) => void;
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
  'name' | 'systemMessage' | 'installation' | 'model' | 'slug' | 'egress';

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
  selectedSkills: [],
  keptSkills: [],
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
    state.selectedSkills.length > 0 ||
    state.toolset.length > 0 ||
    state.toolsChatOnly !== initialState.toolsChatOnly
  );
}

const NewAgentFormContext = createContext<NewAgentFormContextValue | undefined>(
  undefined,
);

/**
 * The wizard's state, shared by its steps. Creating starts empty; editing
 * (`edit` with `initialState`, see `EditAgentPage`) starts from the agent and
 * keeps its technical name fixed — renaming never re-derives it.
 */
export function NewAgentFormProvider({
  children,
  edit,
  initialState: seed = initialState,
}: {
  children: ReactNode;
  edit?: AgentWizardEdit;
  initialState?: NewAgentFormState;
}) {
  const [state, setState] = useState<NewAgentFormState>(seed);
  // The slug auto-derives from the name until the user edits it by hand — and
  // never while editing: an existing agent's technical name cannot change.
  const [slugEdited, setSlugEdited] = useState(Boolean(edit));

  const value = useMemo<NewAgentFormContextValue>(() => {
    // An empty system prompt is valid: the chart ships a default
    // agent.systemMessage, so an empty field means "use the chart default"
    // (agentSpecOf omits it). Only its length is checked.
    const fieldErrors: NewAgentFieldErrors = {};
    fieldErrors.systemMessage = systemMessageProblem(state.systemMessage);
    fieldErrors.egress = egressProblem(parseEgressText(state.egressText));
    if (!state.name.trim()) {
      fieldErrors.name = 'Name is required';
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
      fieldErrors.slug = 'Technical name is required';
    }
    if (!state.installation) {
      fieldErrors.installation = 'Select an environment';
    }
    if (!state.modelConfigName || !state.modelConfigNamespace) {
      fieldErrors.model = 'Select a model';
    }
    // The list keeps its historical order (the summary's, and the tests').
    const validationErrors = (
      [
        'systemMessage',
        'egress',
        'name',
        'slug',
        'installation',
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
      ? changedFields(edit.agent, editStateOfForm(edit.agent, state)).length > 0
      : hasCreateInput(state);

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
          modelConfigName: undefined,
          modelConfigNamespace: undefined,
          modelDisplayName: undefined,
          harness: undefined,
          droppedHarness: prev.harness?.name ?? prev.droppedHarness,
        })),
      // The ModelConfig's namespace is the agent's, and an Agent names a
      // Harness of its own namespace, so a model in another namespace drops
      // the Harness pick.
      selectModelConfig: (name, namespace, displayName) =>
        setState(prev =>
          prev.modelConfigNamespace === namespace
            ? { ...prev, modelConfigName: name, modelDisplayName: displayName }
            : {
                ...prev,
                modelConfigName: name,
                modelConfigNamespace: namespace,
                modelDisplayName: displayName,
                harness: undefined,
                droppedHarness: prev.harness?.name ?? prev.droppedHarness,
              },
        ),
      selectHarness: harness =>
        setState(prev => ({ ...prev, harness, droppedHarness: undefined })),
      setSystemMessage: systemMessage =>
        setState(prev => ({ ...prev, systemMessage })),
      setEgressText: egressText => setState(prev => ({ ...prev, egressText })),
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
        setState(prev => ({ ...prev, toolset: [], toolsChatOnly: true })),
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
      reset: () => {
        setSlugEdited(Boolean(edit));
        setState(seed);
      },
      isDirty,
      isComplete,
      validationErrors,
      fieldErrors,
    };
  }, [state, slugEdited, edit, seed]);

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
