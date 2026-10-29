import { ToolAnnotations } from '../../../apis';
import {
  isDestructive,
  isReadOnly,
  toolEffect,
} from '../../../lib/toolAnnotations';
import { EffectBadge } from '../EffectBadge';

export interface ToolMarkersProps {
  annotations?: ToolAnnotations;
}

/**
 * What a server's markers on its tool (MCP tool annotations, forwarded by
 * muster) say it does, in the one effect vocabulary: a read-only tool
 * "Reads", a destructive one "Changes things", drawn by {@link EffectBadge}
 * as every tool list draws it.
 *
 * Renders nothing for a tool whose server declares neither — which is most of
 * them. {@link ToolTable} drops the whole column when no row in a list has a
 * marker, so an unannotated catalogue costs no width.
 */
export function ToolMarkers({ annotations }: ToolMarkersProps) {
  if (!hasMarkers(annotations)) {
    return null;
  }
  return <EffectBadge effect={toolEffect({ annotations })} />;
}

/** Whether {@link ToolMarkers} would render anything for these annotations. */
export function hasMarkers(annotations?: ToolAnnotations): boolean {
  return isReadOnly({ annotations }) || isDestructive({ annotations });
}
