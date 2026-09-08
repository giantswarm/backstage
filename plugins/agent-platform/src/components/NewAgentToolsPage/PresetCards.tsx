import { Text } from '@backstage/ui';
import type { ToolsetPreset } from '@giantswarm/backstage-plugin-muster';

import {
  presetLabel,
  presetSelector,
  PRESET_FULL,
  PRESET_READ_ONLY,
} from '../../lib/toolset';
import { SelectableCard, SelectableCardGrid } from '../SelectableCard';

/**
 * The presets, one card each, in the order `orderPresets` gives them: the
 * safe choices first, *Full gateway* last with its warning. Checkboxes rather
 * than radios because a preset combines with servers, workflows and tools —
 * "read-only plus this one workflow" is a toolset — while `full` stands alone
 * (the form's toggle keeps it exclusive). *No tools* is not a card: it is what
 * the empty selection means, and the summary bar says so.
 */
export function PresetCards({
  presets,
  selected,
  onToggle,
}: {
  presets: ToolsetPreset[];
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  return (
    <SelectableCardGrid role="group" ariaLabel="Presets" minWidth={240}>
      {presets.map(preset => {
        const selector = presetSelector(preset.name);
        const label = presetLabel(preset.name);
        return (
          <SelectableCard
            key={preset.name}
            role="checkbox"
            selected={selected.has(selector)}
            ariaLabel={`Preset ${label}`}
            onSelect={() => onToggle(selector)}
          >
            <Text weight="bold">
              {label}
              {selector === PRESET_READ_ONLY ? ' · recommended' : ''}
            </Text>
            {preset.description && (
              <Text variant="body-small" color="secondary">
                {preset.description}
              </Text>
            )}
            {selector === PRESET_FULL && (
              <Text variant="body-small" color="danger">
                Warning: the agent can discover and call every tool the gateway
                exposes to whoever invokes it, platform administration included.
                Choose this deliberately.
              </Text>
            )}
            <Text variant="body-x-small" color="secondary">
              <span style={{ fontFamily: 'monospace' }}>{selector}</span>
              {preset.built_in
                ? ' · built in'
                : ' · defined by this installation'}
            </Text>
          </SelectableCard>
        );
      })}
    </SelectableCardGrid>
  );
}
