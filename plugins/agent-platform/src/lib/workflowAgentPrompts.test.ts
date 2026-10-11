import {
  INLINE_DEFINITION_MAX_CHARS,
  type WorkflowEditTarget,
  workflowCreatePrompt,
  workflowEditPrompt,
} from './workflowAgentPrompts';

const TARGET: WorkflowEditTarget = {
  name: 'deploy',
  installation: 'gazelle',
  toolName: 'workflow_deploy',
  gitOps: false,
  definitionYaml: 'name: deploy\nsteps:\n  -\n    id: fetch\n    tool: x_get\n',
};

describe('workflowEditPrompt', () => {
  it('names the workflow, its installation and tool, carries a compact definition, and asks first', () => {
    const prompt = workflowEditPrompt(TARGET);
    expect(prompt).toBe(
      [
        'I\'d like to edit the workflow "deploy" on the gazelle installation (agents run it as workflow_deploy).',
        'Its current definition:\n\n```yaml\nname: deploy\nsteps:\n  -\n    id: fetch\n    tool: x_get\n```',
        'Ask me what should change before you change anything.',
      ].join('\n\n'),
    );
  });

  it('names where to read a long definition instead of carrying it', () => {
    const long = `name: big\nsteps:\n${'  - id: s\n'.repeat(
      INLINE_DEFINITION_MAX_CHARS / 10 + 1,
    )}`;
    const prompt = workflowEditPrompt({ ...TARGET, definitionYaml: long });
    expect(prompt).not.toContain('```');
    expect(prompt).toContain(
      "Read its current definition with muster's core_workflow_get.",
    );
  });

  it('asks for a pull request for a GitOps workflow', () => {
    expect(workflowEditPrompt({ ...TARGET, gitOps: true })).toContain(
      'It is managed through GitOps: propose the change as a pull request',
    );
    expect(workflowEditPrompt(TARGET)).not.toContain('pull request');
  });

  it('fences a definition whose text holds backticks so they cannot close it', () => {
    const prompt = workflowEditPrompt({
      ...TARGET,
      definitionYaml: 'description: "use ```code```"',
    });
    expect(prompt).toContain('````yaml\ndescription: "use ```code```"\n````');
  });

  it('leaves out an unknown installation', () => {
    expect(workflowEditPrompt({ ...TARGET, installation: undefined })).toMatch(
      /^I'd like to edit the workflow "deploy" \(agents run it/,
    );
  });
});

describe('workflowCreatePrompt', () => {
  it('names the installation and asks what the workflow should do', () => {
    expect(workflowCreatePrompt('gazelle')).toBe(
      "I'd like to create a new workflow on the gazelle installation. Ask me what it should do before you write anything.",
    );
    expect(workflowCreatePrompt()).toBe(
      "I'd like to create a new workflow. Ask me what it should do before you write anything.",
    );
  });
});
