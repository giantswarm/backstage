import { useRef } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import useDebounce from 'react-use/esm/useDebounce';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../lib/k8s/VersionTypes';

/**
 * Hook that reports API version issues.
 *
 * Reports two types of issues:
 * - Incompatibilities (errors): When there's no compatible version between client and server
 * - Client outdated (warnings): When compatible, but server supports newer versions than client
 *
 * Deduplication is handled per data provider instance using a Set that tracks reported issues
 * by key: `${type}:${resourceClass}:${cluster}`.
 *
 * Issues are always logged to the console. If an error reporter API is registered,
 * issues are also sent to the error reporter.
 *
 * @param incompatibilities - List of incompatibility states to report as errors
 * @param clientOutdatedStates - List of client outdated states to report as warnings
 */
export function useReportApiVersionIssues(
  incompatibilities: IncompatibilityState[] | null,
  clientOutdatedStates: ClientOutdatedState[] | null,
) {
  const apiHolder = useApiHolder();
  const errorReporter = apiHolder.get(errorReporterApiRef);
  const reportedRef = useRef<Set<string>>(new Set());

  useDebounce(
    () => {
      // Report incompatibilities (errors)
      for (const incompat of incompatibilities ?? []) {
        const key = `error:${incompat.resourceClass}:${incompat.cluster}`;
        if (!reportedRef.current.has(key)) {
          reportedRef.current.add(key);

          const message = `API Version Incompatibility: ${incompat.resourceClass} on ${incompat.cluster}`;
          const extraInfo = {
            type: 'api_version_incompatibility',
            resourceClass: incompat.resourceClass,
            cluster: incompat.cluster,
            clientVersions: incompat.clientVersions,
            serverVersions: incompat.serverVersions,
          };

          // eslint-disable-next-line no-console
          console.error(message, extraInfo);
          errorReporter?.notify(new Error(message), {
            level: 'error',
            ...extraInfo,
          });
        }
      }

      // Report client outdated (warnings)
      for (const outdated of clientOutdatedStates ?? []) {
        const key = `warning:${outdated.resourceClass}:${outdated.cluster}`;
        if (!reportedRef.current.has(key)) {
          reportedRef.current.add(key);

          const message = `API Version Warning: Client outdated for ${outdated.resourceClass} on ${outdated.cluster}`;
          const extraInfo = {
            type: 'api_version_client_outdated',
            resourceClass: outdated.resourceClass,
            cluster: outdated.cluster,
            clientLatestVersion: outdated.clientLatestVersion,
            serverLatestVersion: outdated.serverLatestVersion,
            clientVersions: outdated.clientVersions,
            serverVersions: outdated.serverVersions,
          };

          // eslint-disable-next-line no-console
          console.warn(message, extraInfo);
          errorReporter?.notify(message, { level: 'warning', ...extraInfo });
        }
      }
    },
    100,
    [errorReporter, incompatibilities, clientOutdatedStates],
  );
}
