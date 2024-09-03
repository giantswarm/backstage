import {
  StatusAborted,
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { useTheme } from '@material-ui/core';
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import CheckCircleOutlinedIcon from '@material-ui/icons/CheckCircleOutlined';
import ScheduleOutlinedIcon from '@material-ui/icons/ScheduleOutlined';
import HelpOutlinedIcon from '@material-ui/icons/HelpOutlineOutlined';
import { toSentenceCase } from '../utils/helpers';
import { ResourceRequestStatuses } from '@internal/plugin-gs-common';

export function useResourceRequestStatusDetails(status: string) {
  const theme = useTheme();

  let statusIcon;
  let icon;
  let color;

  switch (status) {
    case ResourceRequestStatuses.Completed:
      statusIcon = StatusOK;
      icon = CheckCircleOutlinedIcon;
      color = theme.palette.status.ok;
      break;

    case ResourceRequestStatuses.Failed:
      statusIcon = StatusError;
      icon = CancelOutlinedIcon;
      color = theme.palette.status.error;
      break;

    case ResourceRequestStatuses.Pending:
      statusIcon = StatusWarning;
      icon = ScheduleOutlinedIcon;
      color = theme.palette.status.warning;
      break;

    case ResourceRequestStatuses.Unknown:
      statusIcon = StatusAborted;
      icon = HelpOutlinedIcon;
      color = theme.palette.status.aborted;
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
