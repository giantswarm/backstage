import semverCoerce from 'semver/functions/coerce';
import semverGte from 'semver/functions/gte';
import semverLt from 'semver/functions/lt';
import semverGt from 'semver/functions/gt';

/**
 * Supported kagent version window.
 *
 * MIN_SUPPORTED — the oldest version we have fixtures for and test against. GS
 *   currently pins the kagent image to 0.9.9.
 * TESTED_UP_TO — the newest version we have fixtures for. Above this we proceed
 *   optimistically (the wire schemas are permissive by design) but log once per
 *   installation.
 */
export const MIN_SUPPORTED_KAGENT_VERSION = '0.9.9';
export const TESTED_UP_TO_KAGENT_VERSION = '0.10.0';

/** The version at which the session share / rename surface appeared. */
const V0_10 = '0.10.0';

/**
 * Named capability flags, derived per installation.
 *
 * Components MUST gate on these rather than comparing versions inline: the
 * fleet runs mixed kagent versions, so every such check has to be
 * per-installation, and centralizing them keeps that from being forgotten.
 */
export type KagentCapabilities = {
  /** Coerced semver of the installation's kagent, or undefined when unknown. */
  version?: string;
  /** Raw `kagent_version` string as reported, for display and logging. */
  rawVersion?: string;
  /** Older than MIN_SUPPORTED — show a notice, but still render rows. */
  isBelowMinSupported: boolean;
  /** Newer than TESTED_UP_TO — proceed optimistically, log once. */
  isAboveTestedCeiling: boolean;
  /**
   * Whether sessions are scoped to the signed-in user.
   *
   * False when the controller runs in `unsecure` mode, where the forwarded
   * token is ignored and every caller resolves to a shared default user — so
   * the list is *not* "your sessions" and must not be labelled as such.
   * Undefined until the identity probe resolves.
   */
  isUserScoped?: boolean;
  /** v0.10+: `PATCH /api/sessions/{id}` exists (session rename). Reserved. */
  canRenameSessionViaPatch: boolean;
  /** v0.10+: `/shares` routes and `share_token` on session reads. Reserved. */
  hasSessionShares: boolean;
  /** v0.10+: `read_only` on session detail. Reserved. */
  hasSessionReadOnly: boolean;
};

/**
 * Capabilities assumed when `/version` fails, is absent, or is unparseable
 * (e.g. a dev build reporting "dev"): the oldest supported version.
 *
 * Degrade, never crash, and never optimistically claim a newer feature.
 */
export const FALLBACK_KAGENT_CAPABILITIES: KagentCapabilities = {
  version: undefined,
  rawVersion: undefined,
  isBelowMinSupported: false,
  isAboveTestedCeiling: false,
  canRenameSessionViaPatch: false,
  hasSessionShares: false,
  hasSessionReadOnly: false,
};

/**
 * Derive capabilities from a raw `kagent_version`.
 *
 * Uses `semver.coerce`, which maps `v0.10.0-beta9` → `0.10.0`. That is
 * deliberate: a 0.10 prerelease already has the 0.10 API surface, and treating
 * it as 0.9.x would mis-gate features.
 */
export function capabilitiesForVersion(
  raw: string | undefined,
): KagentCapabilities {
  const coerced = raw ? semverCoerce(raw) : null;
  if (!coerced) {
    return FALLBACK_KAGENT_CAPABILITIES;
  }

  const version = coerced.version;
  const hasV0_10Surface = semverGte(version, V0_10);

  return {
    version,
    rawVersion: raw,
    isBelowMinSupported: semverLt(version, MIN_SUPPORTED_KAGENT_VERSION),
    isAboveTestedCeiling: semverGt(version, TESTED_UP_TO_KAGENT_VERSION),
    canRenameSessionViaPatch: hasV0_10Surface,
    hasSessionShares: hasV0_10Surface,
    hasSessionReadOnly: hasV0_10Surface,
  };
}
