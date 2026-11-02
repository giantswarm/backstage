import { differenceInMinutes } from 'date-fns/differenceInMinutes';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDate,
  formatLocalDate,
  formatLocalDateFull,
  getRelativeDate,
  parseDate,
} from './utils';
import { useDateTimeZone } from './DateTimeZone';
import { Tooltip, Typography } from '@material-ui/core';

export interface IDateProps extends React.ComponentPropsWithoutRef<
  typeof Typography
> {
  value: string | Date | null | undefined;
  relative?: boolean;
  /**
   * Whether hovering shows the full date. A relative date always does; an
   * absolute one does when this is set. Not passed on to the DOM.
   */
  tooltip?: boolean;
}

// eslint-disable-next-line no-magic-numbers
const REFRESH_TIMEOUT = 60 * 1000; // 1 minute
const REFRESH_PERIOD = 45; // 45 minutes

/**
 * A date, absolute or relative ("5 minutes ago"), in UTC — or in the
 * browser's time zone below a `DateTimeZoneProvider` set to `local`, where
 * hovering always shows the full timestamp with its zone.
 */
export const DateComponent: React.FC<React.PropsWithChildren<IDateProps>> = ({
  value,
  relative,
  tooltip,
  variant = 'inherit',
  ...props
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const timeZone = useDateTimeZone();
  const isLocal = timeZone === 'local';

  const formattedDate = useMemo(() => {
    if (!value) return '';

    return isLocal ? formatLocalDate(value) : formatDate(value);
  }, [value, isLocal]);

  const timeoutId = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!value || !relative) return undefined;

    const givenDate = parseDate(value);
    const distance = differenceInMinutes(currentTime, givenDate);
    if (Math.abs(distance) > REFRESH_PERIOD) {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }

      return undefined;
    }

    timeoutId.current = setTimeout(() => {
      setCurrentTime(new Date());
    }, REFRESH_TIMEOUT);

    return () => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
    };
  }, [value, relative, currentTime]);

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
      <Typography
        component="time"
        variant={variant}
        {...props}
        dateTime={isFinite(parsed.getTime()) ? parsed.toISOString() : undefined}
        title={formatLocalDateFull(value)}
        key="date"
      >
        {visibleDate}
      </Typography>
    );
  }

  if (relative || tooltip) {
    return (
      <Tooltip title={formattedDate}>
        <Typography component="span" variant={variant} {...props} key="date">
          {visibleDate}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Typography component="span" variant={variant} {...props} key="date">
      {visibleDate}
    </Typography>
  );
};
