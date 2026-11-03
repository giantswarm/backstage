import {
  KubeObject,
  KubeObjectInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** Optional category label used to group workflows (a workflow-grouping convention). */
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

/**
 * How a tool step follows the tool's pages (`paginate`): it passes each
 * page's next-page token back and keeps every page's items as one list.
 */
export interface WorkflowPaginate {
  /** The most pages fetched. muster defaults it to 10. */
  maxPages?: number;
  /** Where a page's list is. muster defaults it to `items`. */
  itemsField?: string;
  /** Where a page's next-page token is. muster defaults it to `continue`. */
  tokenField?: string;
  /** The tool argument the token goes in. muster defaults it to `continue`. */
  tokenArg?: string;
}

/**
 * One step, at any depth: exactly one of a tool call (`tool`), a loop
 * (`forEach`) or a concurrent group (`parallel`).
 *
 * The CRD bounds the nesting — a forEach body may hold one nested forEach of
 * tool calls, a parallel group or the cleanup steps only tool calls — so its
 * schema stays structural. The page's model is recursive instead: it draws
 * whatever nesting it is given, and a later CRD that allows more needs no
 * change here.
 */
export interface WorkflowStep {
  id: string;
  tool?: string;
  args?: Record<string, unknown>;
  condition?: WorkflowCondition;
  forEach?: WorkflowForEach;
  parallel?: WorkflowStep[];
  /** A tool step only: follow the tool's pages. */
  paginate?: WorkflowPaginate;
  /**
   * A jq program that reshapes the step's result before it is stored: the
   * tool's result, or a forEach's per-iteration records.
   */
  jq?: string;
  output?: boolean;
  store?: boolean;
  allowFailure?: boolean;
  description?: string;
}

/** A step in a forEach body, a parallel group or the cleanup steps. */
export type WorkflowSubStep = WorkflowStep;

export interface WorkflowForEach {
  items: string;
  as?: string;
  /**
   * How many iterations may run at once. Unset, they run one after another;
   * in a nested loop, within one iteration of the outer loop.
   */
  parallelism?: number;
  steps: WorkflowSubStep[];
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

  /** The steps muster runs when the workflow fails. */
  getOnFailureSteps(): WorkflowSubStep[] {
    return this.jsonData.spec?.onFailure ?? [];
  }

  getCategory() {
    return this.findLabel(WORKFLOW_CATEGORY_LABEL);
  }
}
