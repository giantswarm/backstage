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
      latestRelease?: {
        /**
         * Enables the latest-release processor that annotates Component
         * entities with `giantswarm.io/latest-release-{tag,date}` derived
         * from GitHub Releases for the repo named in
         * `github.com/project-slug`.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * Optional TTL for the in-memory release cache, in seconds.
         * Defaults to 3600 (1 hour).
         * @visibility backend
         */
        cacheTtlSeconds?: number;
      };
      appReadiness?: {
        /**
         * Enables the app readiness processor, which annotates Component
         * entities carrying `giantswarm.io/helmcharts` with whether their
         * newest GitHub release reached the chart registry. Sets the
         * `giantswarm.io/readiness` label to `releasable`, `blocked` or
         * `unknown`, and merges any blockers into
         * `giantswarm.io/readiness-flags`.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * Optional TTL for the in-memory lookup caches (chart tags, GitHub
         * releases and tag confirmations), in seconds. Defaults to 3600
         * (1 hour).
         *
         * This governs catalog write volume as well as API traffic. The
         * `giantswarm.io/readiness-checked` annotation carries the time the
         * underlying lookup ran, so it moves once per TTL per cache key, and
         * each move costs the entity a database write, a stitch, an
         * entity-changed event and a search reindex. Lowering this to get
         * fresher badges multiplies that write amplification by the same
         * factor: at 300 seconds, every chart-bearing component is rewritten
         * twelve times as often.
         * @visibility backend
         */
        cacheTtlSeconds?: number;
      };
      buildStatus?: {
        /**
         * Enables the build status processor, which annotates Component
         * entities carrying `github.com/project-slug` with whether their
         * default branch builds. Sets the `giantswarm.io/build-status` label
         * to `passing`, `failing` or `unknown`, names the failing checks in
         * `giantswarm.io/build-failing-checks`, and merges `BUILD-RED` into
         * `giantswarm.io/readiness-flags` when failing. Never changes the
         * release verdict in `giantswarm.io/readiness`.
         *
         * Needs a GitHub token (app or PAT) — the status rollup is read over
         * GraphQL, which has no anonymous mode.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * CircleCI API token, used to read the branch and outcome of the
         * builds behind failing commit statuses so a red from a branch cut
         * off main, a merge queue or a tag is not counted against main.
         * Public projects are readable without one; private projects need it,
         * and without it their reds stay `unknown`.
         * @visibility secret
         */
        circleciToken?: string;
        /**
         * Optional TTL for the in-memory lookup caches, in seconds. Defaults
         * to 3600 (1 hour). Governs catalog write volume as much as API
         * traffic: `giantswarm.io/build-status-checked` moves once per TTL,
         * and each move rewrites the entity.
         * @visibility backend
         */
        cacheTtlSeconds?: number;
      };
      latestOciRelease?: {
        /**
         * Enables the latest-release processor that annotates Component
         * entities with `giantswarm.io/latest-release-{tag,date}` derived
         * from the OCI registry referenced by `giantswarm.io/helmcharts`.
         * For multi-chart entities, the highest semver across all listed
         * charts wins.
         * @visibility backend
         */
        enabled?: boolean;
        /**
         * Optional TTL for the in-memory tags cache, in seconds.
         * Defaults to 3600 (1 hour).
         * @visibility backend
         */
        cacheTtlSeconds?: number;
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
