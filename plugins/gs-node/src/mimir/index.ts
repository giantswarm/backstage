/**
 * The installation's Mimir, queried with the person's own OIDC token: the
 * gs backend's generic PromQL proxy and agent-platform-backend's per-user
 * model cost both go through it, so tenancy, auth and the error mapping are
 * decided in one place.
 */
export * from './MimirService';
