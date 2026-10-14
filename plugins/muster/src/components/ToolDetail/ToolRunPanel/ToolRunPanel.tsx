import type { ToolEffect } from '../../../lib/toolAnnotations';
import { ToolDetailPanel, type ToolDetailPanelProps } from '../ToolDetailPanel';

/** What the run form says beside its Run button. */
export function tryItNote(
  effect: ToolEffect,
  asCaller: boolean,
): string | undefined {
  const parts = [
    asCaller ? 'Runs as you.' : undefined,
    effect === 'reads' ? 'Nothing is changed.' : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export type ToolRunPanelProps = Omit<ToolDetailPanelProps, 'note'> & {
  /** Whether the tool only reads or changes things. */
  effect: ToolEffect;
  /** Whether the tool acts with the person's own identity downstream. */
  asCaller: boolean;
};

/**
 * A tool's run form and result, as a tool's page and a workflow's Run it tab
 * both show it: one note beside the Run button, worded from what the tool
 * does and whose identity it acts with, and a fresh form per tool and
 * installation. Remembered arguments are stored per installation, and a
 * result must not outlive its tool.
 */
export function ToolRunPanel({
  effect,
  asCaller,
  name,
  installation,
  ...rest
}: ToolRunPanelProps) {
  return (
    <ToolDetailPanel
      key={`${installation}/${name}`}
      name={name}
      installation={installation}
      note={tryItNote(effect, asCaller)}
      {...rest}
    />
  );
}
