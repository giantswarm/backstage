/**
 * Shared kagent wire handling for the Agent Platform plugins.
 *
 * kagent ships no OpenAPI spec and the fleet can run a mix of versions — so
 * tolerance lives in permissive parsing rather than version detection. That only
 * holds while there is exactly one parser and one state map: a second copy in the
 * backend would drift, and the first symptom would be the session switcher rail
 * disagreeing with the state badge on the page it is attached to. That is why the
 * part and metadata readers live here too, even though only the frontend rendered
 * them until the usage summary needed the same arithmetic server-side.
 */
export * from './kagent/kagentSchema';
export * from './kagent/kagentTaskSchema';
export * from './kagent/kagentA2aV1';
export * from './kagent/kagentAgentInstance';
export * from './kagent/kagentMetadata';
export * from './kagent/kagentParts';
export * from './kagent/kagentSessions';
export * from './kagent/kagentSessionDetail';
export * from './kagent/kagentSessionState';
export * from './kagent/kagentSessionStates';
export * from './kagent/kagentSessionUsage';
export * from './kagent/kagentUsage';
