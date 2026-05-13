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
      /**
       * Klaus entity provider instances. Each key is an arbitrary instance ID
       * (e.g. `public`, `internal`); the provider discovers Klaus
       * personalities, toolchains, and plugins from the configured GitHub
       * repositories and emits a Component entity per item.
       * @visibility backend
       */
      klaus?: {
        [instanceId: string]: {
          /**
           * Value for `spec.system` on emitted entities. Omit to leave it
           * unset.
           * @visibility backend
           */
          system?: string;
          /**
           * Value for `spec.owner` on emitted entities. Required because the
           * Backstage `Component` kind requires `spec.owner`.
           * @visibility backend
           */
          owner: string;
          /**
           * Optional namespace for emitted entities. When set, all entities
           * from this instance are placed in the given namespace (and their
           * `subcomponentOf` parent ref uses the same namespace). Omit for the
           * `default` namespace.
           * @visibility backend
           */
          namespace?: string;
          /**
           * Appended to emitted entity names (e.g. `-internal`). Defaults to
           * an empty string.
           * @visibility backend
           */
          namePostfix?: string;
          /**
           * Appended to emitted entity titles (e.g. ` (internal)`). Defaults
           * to an empty string.
           * @visibility backend
           */
          titlePostfix?: string;
          /**
           * Extra tags merged into every emitted entity (in addition to the
           * canonical `klaus-personality` / `klaus-toolchain` /
           * `klaus-plugin` tag).
           * @visibility backend
           */
          tags?: string[];
          /**
           * Optional schedule override for the refresh task.
           * @visibility backend
           */
          schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
          /**
           * Personalities source for this instance. Omit to skip
           * personalities for this instance.
           * @visibility backend
           */
          personalities?: {
            /**
             * GitHub repository URL
             * (e.g. `https://github.com/giantswarm/klaus-personalities`).
             * @visibility backend
             */
            sourceRepository: string;
            /**
             * OCI repository prefix used in image annotations
             * (e.g. `gsoci.azurecr.io/giantswarm/klaus-personalities`). The
             * provider appends `/<name>` per entity.
             * @visibility backend
             */
            ociRepository: string;
          };
          /**
           * Toolchains source for this instance. Omit to skip toolchains for
           * this instance.
           * @visibility backend
           */
          toolchains?: {
            /**
             * GitHub repository URL
             * (e.g. `https://github.com/giantswarm/klaus-toolchains`).
             * @visibility backend
             */
            sourceRepository: string;
            /**
             * OCI repository prefix used in image annotations
             * (e.g. `gsoci.azurecr.io/giantswarm/klaus-toolchains`). The
             * provider appends `/<name>` per entity.
             * @visibility backend
             */
            ociRepository: string;
          };
          /**
           * Plugins source for this instance. Omit to skip plugins for this
           * instance.
           * @visibility backend
           */
          plugins?: {
            /**
             * GitHub repository URL
             * (e.g. `https://github.com/giantswarm/klaus-plugins`).
             * @visibility backend
             */
            sourceRepository: string;
            /**
             * OCI repository prefix used in image annotations
             * (e.g. `gsoci.azurecr.io/giantswarm/klaus-plugins`). The
             * provider appends `/<name>` per entity.
             * @visibility backend
             */
            ociRepository: string;
          };
        };
      };
    };
  };
}
