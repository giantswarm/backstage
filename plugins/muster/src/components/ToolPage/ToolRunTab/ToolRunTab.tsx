import { useEffect } from 'react';
import type { ToolEffect } from '../../../lib/toolAnnotations';
import { ToolRunPanel, useToolRun } from '../../ToolDetail';

export type ToolRunTabProps = {
  /** The tool's name as muster exposes it. */
  name: string;
  installation: string;
  /** Whether the tool only reads or changes things, for the run note. */
  effect: ToolEffect;
  /** Whether the tool acts with the person's own identity downstream. */
  asCaller: boolean;
  /** Told whether a run is in flight, so the page can ask before leaving. */
  onRunningChange: (running: boolean) => void;
};

/**
 * A connector tool's Run it tab: the argument form, the Run button with its
 * note and the result, as the workflow page's Run it tab shows them for a
 * workflow's tool. The page asks before the person leaves while a run is in
 * flight, since the result shows only here.
 */
export function ToolRunTab({
  name,
  installation,
  effect,
  asCaller,
  onRunningChange,
}: ToolRunTabProps) {
  const run = useToolRun(name, installation);
  useEffect(() => {
    onRunningChange(run.isPending);
  }, [onRunningChange, run.isPending]);
  // Leaving the tab ends the page's question; muster finishes the call.
  useEffect(() => () => onRunningChange(false), [onRunningChange]);

  return (
    <ToolRunPanel
      name={name}
      installation={installation}
      effect={effect}
      asCaller={asCaller}
      run={run}
    />
  );
}
