import {
  conditionSummary,
  executionOutcome,
  failedStep,
  toolDisplay,
  workflowEffect,
} from './workflowDisplay';
import type { ServerPrefixInfo } from './toolGrouping';
import type { WorkflowExecutionStep } from '../apis/types';

const PREFIXES: ServerPrefixInfo[] = [
  {
    prefix: 'x_kubernetes',
    serverName: 'gazelle-mcp-kubernetes',
    family: 'kubernetes',
  },
  { prefix: 'x_jira', serverName: 'jira' },
];

describe('toolDisplay', () => {
  it('names the connector that answers a prefixed tool, with the short name', () => {
    expect(toolDisplay('x_kubernetes_get_pods', PREFIXES)).toEqual({
      kind: 'connector',
      connector: 'kubernetes',
      tool: 'get_pods',
    });
    expect(toolDisplay('x_jira_search_issues', PREFIXES)).toEqual({
      kind: 'connector',
      connector: 'jira',
      tool: 'search_issues',
    });
  });

  it('names the connector by its display name where it has one', () => {
    expect(
      toolDisplay('x_jira_search_issues', [
        { prefix: 'x_jira', serverName: 'jira', displayName: 'Acme Jira' },
      ]),
    ).toEqual({
      kind: 'connector',
      connector: 'Acme Jira',
      tool: 'search_issues',
    });
  });

  it('names a called workflow and muster core tools', () => {
    expect(toolDisplay('workflow_cleanup', PREFIXES)).toEqual({
      kind: 'workflow',
      workflow: 'cleanup',
    });
    expect(toolDisplay('core_service_list', PREFIXES)).toEqual({
      kind: 'core',
      tool: 'service_list',
    });
  });

  it('keeps the full name when no connector matches', () => {
    expect(toolDisplay('x_unknown_thing', PREFIXES)).toEqual({
      kind: 'unknown',
      tool: 'x_unknown_thing',
    });
  });
});

describe('conditionSummary', () => {
  it('resolves a fromStep reference to its step number and verdict', () => {
    expect(
      conditionSummary({ fromStep: 'probe', expect: { success: true } }, [
        'fetch',
        'probe',
        'apply',
      ]),
    ).toBe('Only if step 2 (probe) succeeded');
    expect(
      conditionSummary({ fromStep: 'probe', expect: { success: false } }, [
        'probe',
      ]),
    ).toBe('Only if step 1 (probe) failed');
  });

  it('describes tool probes and templates', () => {
    expect(
      conditionSummary({
        tool: 'core_service_status',
        expect: { success: true },
      }),
    ).toBe('Only if a check with core_service_status passes');
    expect(conditionSummary({ template: '{{ .input.dryRun }}' })).toBe(
      'Only if {{ .input.dryRun }}',
    );
  });

  it('falls back to a generic sentence for jsonPath expectations', () => {
    expect(
      conditionSummary(
        { fromStep: 'probe', expect: { jsonPath: { healthy: true } } },
        ['probe'],
      ),
    ).toBe('Only if the result of step 1 (probe) matches what is expected');
  });
});

describe('workflowEffect', () => {
  const tools = [
    { name: 'workflow_report', annotations: { readOnlyHint: true } },
    { name: 'workflow_deploy', annotations: {} },
    { name: 'workflow_scale' },
  ];

  it('is "reads" only when muster derived readOnlyHint for the workflow tool', () => {
    expect(workflowEffect('report', tools)).toBe('reads');
  });

  it('is "changes" when the hint is absent — the honest MCP default', () => {
    expect(workflowEffect('deploy', tools)).toBe('changes');
    expect(workflowEffect('scale', tools)).toBe('changes');
  });

  it('is unknown when the tool is not in the catalogue', () => {
    expect(workflowEffect('missing', tools)).toBeUndefined();
    expect(workflowEffect('missing', null)).toBeUndefined();
  });
});

describe('executionOutcome', () => {
  it('maps each status to its label and tone', () => {
    expect(executionOutcome('completed')).toEqual({
      label: 'Succeeded',
      tone: 'success',
    });
    expect(executionOutcome('failed')).toEqual({
      label: 'Failed',
      tone: 'danger',
    });
    expect(executionOutcome('inprogress')).toEqual({
      label: 'Running',
      tone: 'info',
    });
    expect(executionOutcome('skipped')).toEqual({
      label: 'Skipped',
      tone: 'neutral',
    });
  });
});

describe('failedStep', () => {
  const step = (
    id: string,
    status: WorkflowExecutionStep['status'],
  ): WorkflowExecutionStep => ({
    step_id: id,
    tool: 't',
    status,
    started_at: '2026-10-01T00:00:00Z',
    duration_ms: 10,
  });

  it('finds the first failed step with its 1-based number', () => {
    expect(
      failedStep([
        step('a', 'completed'),
        step('b', 'failed'),
        step('c', 'skipped'),
      ]),
    ).toEqual({ number: 2, step: expect.objectContaining({ step_id: 'b' }) });
  });

  it('is undefined without a failure or without steps', () => {
    expect(failedStep([step('a', 'completed')])).toBeUndefined();
    expect(failedStep(undefined)).toBeUndefined();
  });
});
