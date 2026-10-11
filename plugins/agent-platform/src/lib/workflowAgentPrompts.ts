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

/** The YAML in a fenced block that its own content cannot close. */
function fencedYaml(text: string): string {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map(run => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}yaml\n${text}\n${fence}`;
}

/**
 * The first message of a session with the workflow agent about changing a
 * workflow: which one, on which installation, where its definition lives —
 * inline when compact, else the muster tool that reads it — and how changes
 * reach it (a pull request for a GitOps workflow). The agent asks what should
 * change before touching anything.
 */
export function workflowEditPrompt(target: WorkflowEditTarget): string {
  const where = target.installation
    ? ` on the ${target.installation} installation`
    : '';
  const definition = target.definitionYaml.trim();
  return [
    `I'd like to edit the workflow "${target.name}"${where} (agents run it as ${target.toolName}).`,
    definition.length > 0 && definition.length <= INLINE_DEFINITION_MAX_CHARS
      ? `Its current definition:\n\n${fencedYaml(definition)}`
      : `Read its current definition with muster's core_workflow_get.`,
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
