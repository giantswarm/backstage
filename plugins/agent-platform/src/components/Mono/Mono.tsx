import type { CSSProperties } from 'react';
import { Text } from '@backstage/ui';

/** Identifiers someone may retype into `kubectl`: monospace, breaking anywhere. */
export const MONO: CSSProperties = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
};

/**
 * An identifier as the Technical details fold-outs show it, small and in
 * {@link MONO}.
 */
export function Mono({ children }: { children: string }) {
  return (
    <Text variant="body-small" style={MONO}>
      {children}
    </Text>
  );
}
