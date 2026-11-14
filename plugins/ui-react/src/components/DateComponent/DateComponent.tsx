import { useMemo } from 'react';
import { useNow } from '../../hooks/useNow';
import {
  formatDate,
  formatLocalDate,
  formatLocalDateFull,
  getRelativeDate,
  parseDate,
} from './utils';
import { InfoHint } from '../InfoHint';
import { useDateTimeZone } from './DateTimeZone';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Classic consumers depend on Typography props and UTC tooltip presentation.
import { Tooltip, Typography } from '@material-ui/core';

export interface IDateProps extends React.ComponentPropsWithoutRef<
  typeof Typography
> {
  value: string | Date | null | undefined;
  relative?: boolean;
  /** Exact timestamp disclosure; defaults on for relative dates and tooltips. Keep outside links. */
  disclosure?: boolean;
  /** A list-owned clock avoids one timer per row. */
  now?: number;
  /**
   * Whether hovering shows the full date. A relative date always does; an
   * absolute one does when this is set. Not passed on to the DOM.
   */
  tooltip?: boolean;
}

const REFRESH_TIMEOUT = 60_000;

/**
 * A date, absolute or relative ("5 minutes ago"), in UTC — or in the
 * browser's time zone below a `DateTimeZoneProvider` set to `local`, where
 * hovering always shows the full timestamp with its zone.
 */
export const DateComponent: React.FC<React.PropsWithChildren<IDateProps>> = ({
  value,
  relative,
  tooltip,
  disclosure = Boolean(relative || tooltip),
  now: sharedNow,
  variant = 'inherit',
  ...props
}) => {
  const valid = Boolean(value && isFinite(parseDate(value).getTime()));
  const now = useNow(
    REFRESH_TIMEOUT,
    Boolean(relative && valid && sharedNow === undefined),
  );
  const currentTime = useMemo(
    () => new Date(sharedNow ?? now),
    [sharedNow, now],
  );
  const timeZone = useDateTimeZone();
  const isLocal = timeZone === 'local';

  const formattedDate = useMemo(() => {
    if (!value) return '';

    return isLocal ? formatLocalDate(value) : formatDate(value);
  }, [value, isLocal]);

  const visibleDate = useMemo(() => {
    if (!value) return '';

    if (relative) {
      return getRelativeDate(value, currentTime);
    }

    return formattedDate;
  }, [formattedDate, relative, value, currentTime]);

  if (!value) {
    return null;
  }

  if (isLocal) {
    // A native title on a <time>: the full local timestamp, zone included,
    // without the MUI Tooltip's findDOMNode.
    const parsed = parseDate(value);
    return (
      <>
        <Typography
          component="time"
          variant={variant}
          {...props}
          dateTime={
            isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
          }
          title={formatLocalDateFull(value)}
          key="date"
        >
          {visibleDate}
        </Typography>
        {disclosure && valid && (
          <InfoHint label="Exact date and time" size="small">
            {formatLocalDateFull(value)}
          </InfoHint>
        )}
      </>
    );
  }

  if (relative || tooltip) {
    return (
      <Tooltip title={formattedDate}>
        <span>
          <Typography component="span" variant={variant} {...props} key="date">
            {visibleDate}
          </Typography>
        </span>
      </Tooltip>
    );
  }

  return (
    <Typography component="span" variant={variant} {...props} key="date">
      {visibleDate}
    </Typography>
  );
};
