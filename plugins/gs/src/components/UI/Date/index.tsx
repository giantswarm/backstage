import { differenceInMinutes } from 'date-fns/differenceInMinutes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, getRelativeDate, parseDate } from '../../utils/helpers';
import { Tooltip, Typography } from '@material-ui/core';

interface IDateProps extends React.ComponentPropsWithoutRef<typeof Typography> {
  value: string | Date | null | undefined;
  relative?: boolean;
  tooltip?: boolean;
}

// eslint-disable-next-line no-magic-numbers
const REFRESH_TIMEOUT = 60 * 1000; // 1 minute
const REFRESH_PERIOD = 45; // 45 minutes

export const DateComponent: React.FC<React.PropsWithChildren<IDateProps>> = ({
  value,
  relative,
  variant = 'inherit',
  ...props
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  const formattedDate = useMemo(() => {
    if (!value) return '';

    return formatDate(value);
  }, [value]);

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

  if (relative) {
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
