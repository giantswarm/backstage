/**
 * An agent's default workspace: the workspace its Sessions start in unless
 * the person picks another or none, as an agent names its default toolchains.
 * A name, not a grant: it mounts nothing and admits no one, so every start in
 * it passes the workspace-manager's `authorize_workspace` as the person.
 *
 * agent-manager keeps it as {@link DEFAULT_WORKSPACE_ANNOTATION} on the
 * agent's HelmRelease and `Agent`, written only through `defaultWorkspace`,
 * as `<namespace>/<name>` in the agent's own namespace. The portal names a
 * workspace by its name alone, unique on the installation, so it qualifies
 * the name with the agent's namespace when it writes one.
 */
export const DEFAULT_WORKSPACE_ANNOTATION =
  'agent-platform.giantswarm.io/default-workspace';

/**
 * The capability agent-manager's `get_info` reports when it starts a session
 * that names no workspace in the agent's default one: where the agent form
 * offers a default.
 */
export const DEFAULT_WORKSPACE_CAPABILITY = 'defaultWorkspace';

/** The workspace's name of a `<namespace>/<name>` default, `''` for none. */
export function defaultWorkspaceName(qualified: string | undefined): string {
  const value = qualified?.trim() ?? '';
  const slash = value.indexOf('/');
  return slash < 0 ? value : value.slice(slash + 1);
}

/** The default as agent-manager takes it: the name in the agent's namespace. */
export function qualifiedDefaultWorkspace(
  namespace: string,
  name: string,
): string {
  return name ? `${namespace}/${name}` : '';
}
