/**
 * A connector as muster-backend names it (`GET /servers/names`): the name
 * muster keys the server by (`<namespace>/<name>` for a tenant's), its
 * family, and its `ui.giantswarm.io/display-name`. The one wire shape the
 * backend answers and the frontend reads.
 */
export type ConnectorName = {
  name: string;
  /** `spec.family.name`, for a family member. */
  family?: string;
  /** The CR's `ui.giantswarm.io/display-name`, when one is set. */
  displayName?: string;
};
