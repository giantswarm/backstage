import type { Page } from '@playwright/test';

/**
 * What Customize · Connectors calls the lab's connectors: the display name
 * their charts stamp (`ui.giantswarm.io/display-name`), else their name. The
 * addresses keep the technical name.
 */
export const SHOWN = {
  kubernetes: 'Kubernetes',
  agentManager: 'Agent Manager',
  muster: 'muster',
  fixture: 'lab-oauth-fixture',
} as const;

/** A connector's row in the table: its shown name, then its description. */
export function connectorRow(page: Page, name: string) {
  return page.getByRole('row', { name: new RegExp(`^${name}( |$)`) });
}

/**
 * The sentence the installation-inventory gate opens with for a 401
 * (`inventoryFailureCopy`): the API server refused the portal's token, and the
 * gate replaces the views.
 */
export const INVENTORY_REJECTED_TOKEN = /rejected the portal's token/;
