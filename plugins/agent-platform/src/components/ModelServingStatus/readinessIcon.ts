import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import PauseCircleOutlineIcon from '@material-ui/icons/PauseCircleOutline';
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import StorageIcon from '@material-ui/icons/Storage';
import type { ServedModelReadiness } from '../../lib/serving';

/**
 * The glyph per served-model readiness, shared by every place that renders
 * the vocabulary of `lib/serving.ts` (the labels and intents live there; the
 * icons are React components, so they live here). A pause for `idle` (parked,
 * comes back on request), a disk for `available`, a download arrow for
 * `downloading`, a warning triangle for `notServing` (the one state that
 * needs a hand), the hourglass for `pending`.
 */
export const SERVED_READINESS_ICON: Record<
  ServedModelReadiness,
  typeof CheckCircleIcon
> = {
  ready: CheckCircleIcon,
  idle: PauseCircleOutlineIcon,
  notServing: ReportProblemIcon,
  available: StorageIcon,
  downloading: CloudDownloadIcon,
  notReady: ErrorIcon,
  pending: HourglassEmptyIcon,
};
