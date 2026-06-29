import {
  KubeObject,
  KubeObjectInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** Optional category label used to group workflows (klaus-lab convention). */
export const WORKFLOW_CATEGORY_LABEL = 'klaus-lab.giantswarm.io/category';

export interface WorkflowArgDefinition {
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface WorkflowConditionExpectation {
  success?: boolean;
  jsonPath?: Record<string, unknown>;
}

export interface WorkflowCondition {
  template?: string;
  tool?: string;
  args?: Record<string, unknown>;
  fromStep?: string;
  expect?: WorkflowConditionExpectation;
  expectNot?: WorkflowConditionExpectation;
}

export interface WorkflowSubStep {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  condition?: WorkflowCondition;
  output?: boolean;
  store?: boolean;
  allowFailure?: boolean;
  description?: string;
}

export interface WorkflowForEach {
  items: string;
  as?: string;
  steps: WorkflowSubStep[];
}

export interface WorkflowStep {
  id: string;
  tool?: string;
  args?: Record<string, unknown>;
  condition?: WorkflowCondition;
  forEach?: WorkflowForEach;
  parallel?: WorkflowSubStep[];
  output?: boolean;
  store?: boolean;
  allowFailure?: boolean;
  description?: string;
}

interface MusterWorkflowInterface extends KubeObjectInterface {
  spec?: {
    description?: string;
    args?: Record<string, WorkflowArgDefinition>;
    steps?: WorkflowStep[];
    onFailure?: WorkflowSubStep[];
    output?: Record<string, unknown>;
  };
  status?: {
    valid?: boolean;
    validationErrors?: string[];
    referencedTools?: string[];
    stepCount?: number;
  };
}

/**
 * The muster Workflow CRD (`muster.giantswarm.io/v1alpha1`). Named
 * `MusterWorkflow` to avoid colliding with the MCP-API `Workflow` type in
 * `apis/types.ts`.
 */
export class MusterWorkflow extends KubeObject<MusterWorkflowInterface> {
  static readonly supportedVersions = ['v1alpha1'] as const;
  static readonly group = 'muster.giantswarm.io';
  static readonly kind = 'Workflow' as const;
  static readonly plural = 'workflows';

  getDescription() {
    return this.jsonData.spec?.description;
  }

  getArgs() {
    return this.jsonData.spec?.args ?? {};
  }

  getSteps() {
    return this.jsonData.spec?.steps ?? [];
  }

  /** Step count from `.status.stepCount`, falling back to the spec length. */
  getStepCount() {
    return this.jsonData.status?.stepCount ?? this.getSteps().length;
  }

  /**
   * Whether muster considers the workflow definition valid (`status.valid`).
   * This is a *quality* signal, not a runnability one: muster's validator has
   * false-positives (e.g. it demands a top-level `tool` on `parallel`/`forEach`
   * container steps), so an invalid workflow can still run. Surface validation
   * complaints via `getValidationErrors()` as a non-blocking warning rather than
   * gating runnability on this — see `isRunnable()`.
   */
  isValid() {
    return this.jsonData.status?.valid ?? false;
  }

  /**
   * Whether the workflow can be run. muster exposes an aggregated
   * `workflow_<name>` tool for every Workflow CR regardless of the validator's
   * `status.valid` verdict, so any loaded workflow is runnable. Decoupling this
   * from `isValid()` is decision D2 of the muster-UI iteration-2 ADR: a workflow
   * that executes must never present as "Unavailable".
   *
   * ponytail: the CRD carries no per-workflow runnable signal, so any loaded
   * workflow is treated as runnable. Upgrade path: if muster surfaces a
   * tool-existence/health flag for the aggregated tool, gate on it here.
   */
  isRunnable() {
    return true;
  }

  getValidationErrors() {
    return this.jsonData.status?.validationErrors ?? [];
  }

  /** True when muster flagged the definition but it remains runnable. */
  hasValidationWarning() {
    return !this.isValid();
  }

  getReferencedTools() {
    return this.jsonData.status?.referencedTools ?? [];
  }

  getCategory() {
    return this.findLabel(WORKFLOW_CATEGORY_LABEL);
  }
}
