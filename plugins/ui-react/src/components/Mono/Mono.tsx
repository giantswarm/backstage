import type { CSSProperties } from 'react';
import { Text } from '@backstage/ui';
import { useFactTextVariant } from '../FactList';

/** Identifiers someone may retype into `kubectl`: monospace, breaking anywhere. */
export const MONO: CSSProperties = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
};

/**
 * An identifier as the Technical details fold-outs (agent, model, connector)
 * show it, in {@link MONO}: at the size of the fact list it is a value in,
 * small anywhere else.
 */
export function Mono({ children }: { children: string }) {
  const variant = useFactTextVariant();
  return (
    <Text variant={variant} style={MONO}>
      {children}
    </Text>
  );
}
