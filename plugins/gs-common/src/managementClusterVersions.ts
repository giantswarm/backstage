/**
 * Header the frontend forwards the person's main Dex ID token in: the subject
 * token the cluster-token route exchanges for an installation's token, and the
 * one the management cluster versions endpoint exchanges on their behalf.
 */
export const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

/**
 * One version cell of the Installations page. A failed cell carries a short
 * status for the cell (`reason`) and, where there is more to say, the longer
 * explanation for its hover (`detail`).
 */
export type ManagementClusterVersionCell =
  | { state: 'known'; version: string }
  | { state: 'absent'; reason: string }
  | { state: 'failed'; reason: string; detail?: string };

export type ManagementClusterVersions = {
  kubernetes: ManagementClusterVersionCell;
  release: ManagementClusterVersionCell;
};

/** The answer of `GET /api/gs/installations/versions`. */
export type ManagementClusterVersionsResponse = {
  /** The versions of every installation the backend reads as the person. */
  installations: Record<string, ManagementClusterVersions>;
  /**
   * The installations only the browser can read as the person: their own
   * OIDC sign-in (not covered by the cluster token broker) or a `backendUrl`
   * override that serves their cluster from another backend.
   */
  readInBrowser: string[];
};
