import type { ToolAnnotations } from '../../../apis';
import { isDestructive, isReadOnly } from '../../../lib/toolAnnotations';

/**
 * What a tool's connector declares about it in its MCP annotations, a line
 * each, in words. A tool that is not read-only counts as changing things,
 * as the effect badge says; its other hints only refine that. Without any
 * annotation, a single line says so.
 */
export function annotationLines(annotations?: ToolAnnotations): string[] {
  const declared = Object.values(annotations ?? {}).some(
    value => typeof value === 'boolean',
  );
  if (!annotations || !declared) {
    return ['None declared, so it counts as changing things'];
  }
  const tool = { annotations };
  const lines: string[] = [];
  if (isReadOnly(tool)) {
    lines.push('Only reads');
  } else {
    lines.push('Can change things');
    if (isDestructive(tool)) {
      lines.push('Can delete or overwrite');
    } else if (annotations.destructiveHint === false) {
      lines.push('Only adds, never deletes or overwrites');
    }
    if (annotations.idempotentHint === true) {
      lines.push('Running it again with the same inputs changes nothing more');
    }
  }
  if (annotations.openWorldHint === true) {
    lines.push('Reaches systems outside its connector');
  } else if (annotations.openWorldHint === false) {
    lines.push('Stays within its connector’s own data');
  }
  return lines;
}
