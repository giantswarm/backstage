import { useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import useDebounce from 'react-use/esm/useDebounce';
import { errorReporterApiRef } from '../apis/errorReporter';
import {
  ClientOutdatedState,
  IncompatibilityState,
} from '../lib/k8s/VersionTypes';

/**
 * Hook that reports API version issues to the error reporter.
 *
 * Reports two types of issues:
 * - Incompatibilities (errors): When there's no compatible version between client and server
 * - Client outdated (warnings): When compatible, but server supports newer versions than client
 *
 * Deduplication is handled per data provider instance using a Set that tracks reported issues
 * by key: `${type}:${resourceClass}:${cluster}`.
 *
 * @param incompatibilities - List of incompatibility states to report as errors
 * @param clientOutdatedStates - List of client outdated states to report as warnings
 */
export function useReportApiVersionIssues(
  incompatibilities: IncompatibilityState[] | null,
  clientOutdatedStates: ClientOutdatedState[] | null,
) {
  const errorReporter = useApi(errorReporterApiRef);
  const reportedRef = useRef<Set<string>>(new Set());

  useDebounce(
    () => {
      // Report incompatibilities (errors)
      for (const incompat of incompatibilities ?? []) {
        const key = `error:${incompat.resourceClass}:${incompat.cluster}`;
        if (!reportedRef.current.has(key)) {
          reportedRef.current.add(key);
          errorReporter.notify(
            new Error(
              `API Version Incompatibility: ${incompat.resourceClass} on ${incompat.cluster}`,
            ),
            {
              level: 'error',
              type: 'api_version_incompatibility',
              resourceClass: incompat.resourceClass,
              cluster: incompat.cluster,
              clientVersions: incompat.clientVersions,
              serverVersions: incompat.serverVersions,
            },
          );
        }
      }

      // Report client outdated (warnings)
      for (const outdated of clientOutdatedStates ?? []) {
        const key = `warning:${outdated.resourceClass}:${outdated.cluster}`;
        if (!reportedRef.current.has(key)) {
          reportedRef.current.add(key);
          errorReporter.notify(
            `API Version Warning: Client outdated for ${outdated.resourceClass} on ${outdated.cluster}`,
            {
              level: 'warning',
              type: 'api_version_client_outdated',
              resourceClass: outdated.resourceClass,
              cluster: outdated.cluster,
              clientLatestVersion: outdated.clientLatestVersion,
              serverLatestVersion: outdated.serverLatestVersion,
              clientVersions: outdated.clientVersions,
              serverVersions: outdated.serverVersions,
            },
          );
        }
      }
    },
    100,
    [incompatibilities, clientOutdatedStates],
  );
}
