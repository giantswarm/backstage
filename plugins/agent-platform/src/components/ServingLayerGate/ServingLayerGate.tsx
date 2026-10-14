import type { ReactNode } from 'react';
import { QueryClientProvider } from '../QueryClientProvider';
import {
  hasServingLayer,
  ServingProvider,
  useServing,
} from '../ServingProvider';

function Gate({ children }: { children: ReactNode }) {
  return hasServingLayer(useServing()) ? <>{children}</> : null;
}

/**
 * Renders its children only once some installation has a serving layer this
 * portal can see (or could not be asked): the condition under which the Models
 * tab offers its Serving view.
 */
export function ServingLayerGate({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider>
      <ServingProvider>
        <Gate>{children}</Gate>
      </ServingProvider>
    </QueryClientProvider>
  );
}
