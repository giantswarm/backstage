import { createContext, ReactNode, useContext } from 'react';

/**
 * The workflow an `editAction` attachment of `sub-page:muster/workflows`
 * describes, read with {@link useWorkflowPageTarget}.
 */
export type WorkflowPageTarget = {
  /** The workflow's name (its CR's). */
  name: string;
  /** The installation whose muster runs it. */
  installation?: string;
  /** The tool agents run it by: `workflow_<name>`. */
  toolName: string;
  /** Whether Git holds the definition (GitOps), else muster's own store. */
  gitOps: boolean;
  /**
   * The definition as YAML, in the shape muster's `core_workflow_*` tools
   * take (name, description, args, steps, onFailure, output).
   */
  definitionYaml: string;
};

const WorkflowPageTargetContext = createContext<WorkflowPageTarget | undefined>(
  undefined,
);

export function WorkflowPageTargetProvider({
  target,
  children,
}: {
  target: WorkflowPageTarget;
  children: ReactNode;
}) {
  return (
    <WorkflowPageTargetContext.Provider value={target}>
      {children}
    </WorkflowPageTargetContext.Provider>
  );
}

/**
 * The workflow of the shell's workflow page an attachment renders on.
 * Undefined outside that page.
 */
export function useWorkflowPageTarget(): WorkflowPageTarget | undefined {
  return useContext(WorkflowPageTargetContext);
}
