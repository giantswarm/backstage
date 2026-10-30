import { useLocation } from 'react-router-dom';
import { LastDaysSelect } from '@giantswarm/backstage-plugin-ui-react';
import { EnvironmentSelect } from '../EnvironmentSelect';
import { OrganizationSelect } from './OrganizationSelect';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useUsageInstallation } from '../../hooks/useUsageInstallation';
import { useUsageOrganization } from '../../hooks/useUsageOrganization';
import { useUsageOrganizations } from '../../hooks/useUsageOrganizations';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { USAGE_WINDOW_OPTIONS } from '../../lib/usageWindow';

/**
 * The Usage screen's scope controls: which environment (installation) it
 * reads, which organization's agents, and over which window.
 *
 * The Organization control shows on the gateway views only (Overview and
 * Cost): the gateway labels every call with the namespace its agent runs in,
 * so those views narrow to one organization by a matcher on their queries;
 * Your sessions is the reader's own slice and Connectors is muster's, and
 * neither has an organization to narrow by. It shows from two organizations
 * on, or when a link names one: one organization is no choice to offer.
 *
 * The Environment control appears **only when the portal knows more than one
 * installation** (decision O5); `EnvironmentSelect` owns that gate and
 * renders no slot otherwise.
 *
 * The window control shows on every view. The gateway views scope their
 * queries by it; Your sessions narrows the kagent fan-out's fixed-window
 * answer client-side (`AgentUsageSection` owns the honest labelling when the
 * selection asks for more than that window holds).
 *
 * On Your sessions, windows **larger than the backend's reported window are
 * disabled options** rather than choices: selecting one could only ever
 * re-show the same figures under a bigger number. Each says why under its
 * name, which a screen reader reads with it and every device shows once the
 * select is open. The window comes from the same cached
 * query `AgentUsageSection` reads (`useSessionUsage`, keyed per installation),
 * so this costs no extra request on that view and runs no query on the others
 * (`enabled` gates it). While the response is still loading nothing is
 * disabled — a control must not flicker locked over a guess — and a
 * deep-linked selection beyond the window stays rendered as today:
 * `AgentUsageSection`'s note explains it instead of this control clamping the
 * URL.
 */
export function UsageScopeBar() {
  const { days, setDays } = useUsageWindow();

  // Only the sessions view has a backend-fixed window; the gateway views
  // query any window directly, so everything stays selectable there.
  const { pathname } = useLocation();
  const isSessionsView = /\/your-sessions\/?$/.test(pathname);
  const isConnectorsView = /\/connectors\/?$/.test(pathname);
  const isGatewayView = !isSessionsView && !isConnectorsView;

  const { installation } = useUsageInstallation();
  const { usage } = useSessionUsage(installation, {
    enabled: isSessionsView,
  });

  // The organizations to offer: read only where the control can show, so the
  // other views start no query for it.
  const { namespace, setNamespace } = useUsageOrganization();
  const { namespaces } = useUsageOrganizations(
    isGatewayView ? installation : undefined,
    days,
  );
  const offersOrganizations =
    isGatewayView && (namespaces.length > 1 || namespace !== undefined);

  // Undefined until a response carries a usable window — no response yet, a
  // response whose `windowDays` the reader coerced to 0, or another view —
  // and nothing is disabled on undefined. (`AgentUsageSection` falls back to
  // a nominal 30 for its *copy* in the coerced-0 case; a value the backend
  // never actually said is not grounds to lock a control.)
  const backendWindowDays =
    isSessionsView && usage && usage.windowDays > 0
      ? usage.windowDays
      : undefined;

  const unavailableReason = (option: number) =>
    backendWindowDays !== undefined && option > backendWindowDays
      ? `kagent keeps ${backendWindowDays} days of session usage`
      : undefined;

  // A fragment: the controls are items of ShellPage's header actions row,
  // which spaces and aligns them (bottom edges, so the two selects' boxes line
  // up, each under its own label).
  return (
    <>
      <EnvironmentSelect component="kagent" />
      {offersOrganizations && (
        <OrganizationSelect
          namespaces={namespaces}
          value={namespace}
          onChange={setNamespace}
        />
      )}
      <LastDaysSelect
        options={USAGE_WINDOW_OPTIONS}
        value={days}
        onChange={setDays}
        unavailableReason={unavailableReason}
      />
    </>
  );
}
