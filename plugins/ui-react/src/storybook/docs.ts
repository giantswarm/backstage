/**
 * Helpers for a consistent per-component documentation bar in Storybook.
 *
 * Every `ui-react` story sets `parameters.docs.description.component` to the
 * output of {@link componentDocs}, so each autodocs page opens with the same
 * shape: a "what it is / when to use it" blurb followed by an explicit
 * migration-status note. The migration note matters because `ui-react` is
 * mid-migration from MUI v4 (`@material-ui/core`, deprecated) to bui
 * (`@backstage/ui`, preferred for new work) — humans and agents both need to
 * know which components are in flux before extending them.
 *
 * This module lives in the plugin (not `.storybook/`) so stories import it with
 * a plain in-package path and it is type-checked alongside the rest of `src`.
 */

export type MigrationStatus =
  // Still built on MUI v4 (`@material-ui/core`) — deprecated, migrate to bui.
  | 'mui-v4'
  // Migrated to bui (`@backstage/ui`) — the preferred stack.
  | 'bui'
  // Built on `@backstage/core-components` (classic Backstage, legacy).
  | 'core-components'
  // A mix (e.g. bui component shell with residual MUI v4 styling).
  | 'mixed'
  // No UI-framework dependency (plain markup / headless logic).
  | 'none';

const MIGRATION_LABELS: Record<MigrationStatus, string> = {
  'mui-v4':
    '⚠️ **Migration status: MUI v4 (deprecated).** Built on `@material-ui/core`. ' +
    'Prefer bui (`@backstage/ui`) when building something new; this component is a ' +
    'candidate for migration.',
  bui:
    '✅ **Migration status: bui.** Built on `@backstage/ui`, the preferred stack. ' +
    'Reuse this instead of hand-rolling a bui equivalent.',
  'core-components':
    'ℹ️ **Migration status: core-components (legacy).** Built on ' +
    '`@backstage/core-components`. Prefer bui (`@backstage/ui`) for new work.',
  mixed:
    '⚠️ **Migration status: mixed.** Partly on bui (`@backstage/ui`), partly on ' +
    'MUI v4 (`@material-ui/core`, deprecated). The MUI v4 parts are candidates for ' +
    'migration.',
  none:
    'ℹ️ **Migration status: framework-agnostic.** No MUI v4 / bui dependency — ' +
    'nothing to migrate.',
};

export function componentDocs(opts: {
  /** One-line "what it is". */
  summary: string;
  /** "When to use it" — a sentence or a short markdown list. */
  whenToUse: string;
  /** Which UI stack it is built on (drives the migration-status note). */
  migration: MigrationStatus;
  /** Optional extra markdown appended after the migration note. */
  extra?: string;
}): string {
  return [
    opts.summary,
    '',
    `**When to use it:** ${opts.whenToUse}`,
    '',
    MIGRATION_LABELS[opts.migration],
    opts.extra ? `\n${opts.extra}` : '',
  ].join('\n');
}
