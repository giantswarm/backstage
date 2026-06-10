/**
 * Types mirroring the muster workflow data model
 * (giantswarm/muster internal/api), as returned by the muster-backend
 * REST proxy.
 */

export interface WorkflowArgDefinition {
  type: string;
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface WorkflowConditionExpectation {
  success?: boolean;
  json_path?: Record<string, unknown>;
}

export interface WorkflowCondition {
  tool?: string;
  args?: Record<string, unknown>;
  from_step?: string;
  expect?: WorkflowConditionExpectation;
  expect_not?: WorkflowConditionExpectation;
}

export interface WorkflowStep {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  condition?: WorkflowCondition;
  allow_failure?: boolean;
  outputs?: Record<string, unknown>;
  store?: boolean;
  description?: string;
}

export interface Workflow {
  name: string;
  description?: string;
  args?: Record<string, WorkflowArgDefinition>;
  steps: WorkflowStep[];
  available?: boolean;
  createdAt?: string;
  lastModified?: string;
}

export interface WorkflowListItem {
  name: string;
  description?: string;
  available?: boolean;
}

export interface WorkflowListResponse {
  workflows: WorkflowListItem[] | null;
}

export interface WorkflowGetResponse {
  workflow: Workflow;
  yaml?: string;
}

/** Execution status reported by muster; steps additionally use `skipped`. */
export type WorkflowExecutionStatus =
  | 'inprogress'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface WorkflowExecutionStep {
  step_id: string;
  tool: string;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  stored_as?: string;
}

export interface WorkflowExecution {
  execution_id: string;
  workflow_name: string;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  steps?: WorkflowExecutionStep[];
}

export interface WorkflowExecutionSummary {
  execution_id: string;
  workflow_name: string;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  step_count: number;
  error?: string;
}

export interface WorkflowExecutionListResponse {
  executions: WorkflowExecutionSummary[] | null;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ListExecutionsOptions {
  workflowName?: string;
  status?: 'inprogress' | 'completed' | 'failed';
  limit?: number;
  offset?: number;
}

export interface MusterApi {
  listWorkflows(): Promise<WorkflowListResponse>;
  getWorkflow(name: string): Promise<WorkflowGetResponse>;
  listExecutions(
    options?: ListExecutionsOptions,
  ): Promise<WorkflowExecutionListResponse>;
  getExecution(executionId: string): Promise<WorkflowExecution>;
}
