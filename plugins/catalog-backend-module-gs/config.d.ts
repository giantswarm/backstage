import type { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    processors?: {
      sbomDependencies?: {
        /**
         * Enables the SBOM dependency processor which annotates Component
         * entities with `dependsOn` entries derived from GitHub SBOM data.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * Optional schedule override for the SBOM refresh task.
         * @visibility backend
         */
        schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
      };
      pagerDutyAnnotations?: {
        /**
         * Enables the PagerDuty annotation processor.
         * @visibility backend
         */
        enabled?: boolean;
      };
    };
    providers?: {
      klausPersonalities?: {
        /**
         * Enables the Klaus personalities entity provider. When true, the
         * provider discovers personalities under `personalities/<name>/` in
         * `giantswarm/klaus-personalities` and
         * `giantswarm/klaus-personalities-internal`, and emits one
         * Component entity per personality.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * Optional schedule override for the personalities refresh task.
         * @visibility backend
         */
        schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
      };
    };
  };
}
