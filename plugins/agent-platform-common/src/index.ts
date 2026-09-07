/**
 * Shared kagent wire handling for the Agent Platform plugins.
 *
 * kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is on v0.10.x, and
 * the fleet can run a mix — so tolerance lives in permissive parsing rather than
 * version detection. That only holds while there is exactly one parser and one
 * state map: a second copy in the backend would drift, and the first symptom
 * would be the session switcher rail disagreeing with the state badge on the page
 * it is attached to.
 */
export * from './kagent/kagentSchema';
export * from './kagent/kagentTaskSchema';
export * from './kagent/kagentSessions';
export * from './kagent/kagentSessionDetail';
export * from './kagent/kagentSessionState';
export * from './kagent/kagentSessionStates';
