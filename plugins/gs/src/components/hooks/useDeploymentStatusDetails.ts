import {
  StatusAborted,
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { useTheme } from '@material-ui/core';
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import CheckCircleOutlinedIcon from '@material-ui/icons/CheckCircleOutlined';
import HelpOutlinedIcon from '@material-ui/icons/HelpOutlineOutlined';
import ScheduleOutlinedIcon from '@material-ui/icons/ScheduleOutlined';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import { toSentenceCase } from '../utils/helpers';
import {
  AppStatuses,
  HelmReleaseStatuses,
} from '@giantswarm/backstage-plugin-gs-common';

export function useAppStatusDetails(status: string) {
  const theme = useTheme();

  let statusIcon;
  let icon;
  let color;

  switch (status) {
    case AppStatuses.Unknown:
      statusIcon = StatusAborted;
      icon = HelpOutlinedIcon;
      color = theme.palette.status.aborted;
      break;

    case AppStatuses.Uninstalled:
      statusIcon = StatusAborted;
      icon = DeleteOutlineIcon;
      color = theme.palette.status.aborted;
      break;

    case AppStatuses.Uninstalling:
      statusIcon = StatusWarning;
      icon = DeleteOutlineIcon;
      color = theme.palette.status.warning;
      break;

    case AppStatuses.Superseded:
    case AppStatuses.PendingInstall:
    case AppStatuses.PendingUpgrade:
    case AppStatuses.PendingRollback:
      statusIcon = StatusWarning;
      icon = ScheduleOutlinedIcon;
      color = theme.palette.status.warning;
      break;

    case AppStatuses.Deployed:
      statusIcon = StatusOK;
      icon = CheckCircleOutlinedIcon;
      color = theme.palette.status.ok;
      break;

    default:
      statusIcon = StatusError;
      icon = CancelOutlinedIcon;
      color = theme.palette.status.error;
  }

  return {
    statusIcon,
    icon,
    color,
    label: toSentenceCase(status.replace(/-/g, ' ')),
  };
}

export function useHelmReleaseStatusDetails(status: string) {
  const theme = useTheme();

  let statusIcon;
  let icon;
  let color;
  switch (status) {
    case HelmReleaseStatuses.Unknown:
      statusIcon = StatusAborted;
      icon = HelpOutlinedIcon;
      color = theme.palette.status.aborted;
      break;

    case HelmReleaseStatuses.Reconciling:
    case HelmReleaseStatuses.Stalled:
      statusIcon = StatusWarning;
      icon = ScheduleOutlinedIcon;
      color = theme.palette.status.warning;
      break;

    case HelmReleaseStatuses.Reconciled:
      statusIcon = StatusOK;
      icon = CheckCircleOutlinedIcon;
      color = theme.palette.status.ok;
      break;

    default:
      statusIcon = StatusError;
      icon = CancelOutlinedIcon;
      color = theme.palette.status.error;
  }

  return {
    statusIcon,
    icon,
    color,
    label: toSentenceCase(status.replace(/-/g, ' ')),
  };
}
