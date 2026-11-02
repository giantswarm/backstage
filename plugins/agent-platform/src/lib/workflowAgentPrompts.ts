import { fencedData, inlineData, UNTRUSTED_DATA_NOTE } from './promptData';

/**
 * The workflow a hand-off is about: the fields of muster's
 * `WorkflowPageTarget` the first message needs (structurally the same, so
 * the page's target passes as is).
 */
export type WorkflowEditTarget = {
  name: string;
  installation?: string;
  /** The tool agents run it by: `workflow_<name>`. */
  toolName: string;
  /** Whether Git holds the definition (GitOps). */
  gitOps: boolean;
  /** The definition as YAML, in the shape muster's workflow tools take. */
  definitionYaml: string;
};

/**
 * The longest definition the first message carries inline. Past it the
 * message names where the agent reads it instead: a hundred-step workflow
 * would bury the request under its YAML, and the agent reads the current
 * definition through muster anyway.
 */
export const INLINE_DEFINITION_MAX_CHARS = 2000;

/**
 * The first message of a session with the workflow agent about changing a
 * workflow: which one, on which installation, where its definition lives —
 * inline when compact, else the muster tool that reads it — and how changes
 * reach it (a pull request for a GitOps workflow). The agent asks what should
 * change before touching anything. Whoever authors the workflow controls its
 * name and definition: the name goes in on one line, and the definition is
 * framed as data, not instructions (see `promptData`).
 */
export function workflowEditPrompt(target: WorkflowEditTarget): string {
  const where = target.installation
    ? ` on the ${target.installation} installation`
    : '';
  const definition = target.definitionYaml.trim();
  return [
    `I'd like to edit the workflow "${inlineData(target.name)}"${where} (agents run it as ${inlineData(target.toolName)}).`,
    definition.length > 0 && definition.length <= INLINE_DEFINITION_MAX_CHARS
      ? `Its current definition follows. ${UNTRUSTED_DATA_NOTE}\n\n${fencedData(definition, 'yaml')}`
      : `Read its current definition with muster's core_workflow_get. ${UNTRUSTED_DATA_NOTE}`,
    target.gitOps
      ? 'It is managed through GitOps: propose the change as a pull request to the repository it comes from, and link it here.'
      : undefined,
    'Ask me what should change before you change anything.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The first message of a session with the workflow agent about a new
 * workflow, on the installation the overview shows.
 */
export function workflowCreatePrompt(installation?: string): string {
  const where = installation ? ` on the ${installation} installation` : '';
  return `I'd like to create a new workflow${where}. Ask me what it should do before you write anything.`;
}
