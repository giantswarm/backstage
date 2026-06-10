import { useTheme } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import RemoveCircleOutlineIcon from '@material-ui/icons/RemoveCircleOutline';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import { CircularProgress } from '@material-ui/core';
import { StepNodeStatus } from '../../lib/workflowToGraph';
import { statusColor } from './statusColors';

export function StatusIcon({ status }: { status?: StepNodeStatus }) {
  const theme = useTheme();
  const color = statusColor(theme, status);
  const style = { color, fontSize: 18 };

  switch (status) {
    case 'completed':
      return <CheckCircleIcon style={style} />;
    case 'failed':
      return <ErrorIcon style={style} />;
    case 'inprogress':
      return <CircularProgress size={16} style={{ color }} />;
    case 'skipped':
      return <RemoveCircleOutlineIcon style={style} />;
    case 'pending':
      return <RadioButtonUncheckedIcon style={style} />;
    default:
      return null;
  }
}
