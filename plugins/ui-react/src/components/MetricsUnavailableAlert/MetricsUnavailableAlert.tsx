import { ReactNode } from 'react';
import { Alert } from '@backstage/ui';
import { describeMimirFailure } from './describeMimirFailure';

export type MetricsUnavailableAlertProps = {
  /** The failed read's error, as the Mimir query hooks report it. */
  error: unknown;
  /**
   * The title when the failure has no words of its own: what could not be
   * shown. Defaults to "Metrics unavailable".
   */
  title?: string;
  /** A sentence under that title, for the same case. */
  description?: ReactNode;
  /**
   * What to render instead of the alert when the failure has no words of its
   * own, for a caller whose generic failure is a line of text, not a warning.
   */
  fallback?: ReactNode;
};

/**
 * The warning a card or section shows in place of figures it could not read
 * from Mimir. When the backend said why (Mimir cannot read older data just
 * now), it says that in the same words everywhere; otherwise it shows the
 * caller's title and description, or its `fallback`.
 */
export function MetricsUnavailableAlert({
  error,
  title = 'Metrics unavailable',
  description,
  fallback,
}: MetricsUnavailableAlertProps) {
  const known = describeMimirFailure(error);
  if (!known && fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <Alert
      status="warning"
      icon
      title={known?.title ?? title}
      description={known?.description ?? description}
    />
  );
}
