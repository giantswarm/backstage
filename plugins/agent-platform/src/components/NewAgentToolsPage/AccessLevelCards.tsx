import { Text } from '@backstage/ui';
import type { ToolsetPreset } from '@giantswarm/backstage-plugin-muster';

import {
  presetLabel,
  presetSelector,
  PRESET_FULL,
  PRESET_READ_ONLY,
} from '../../lib/toolset';
import { SelectableCard, SelectableCardGrid } from '../SelectableCard';
import {
  ACCESS_CHAT_ONLY,
  ACCESS_OWN_PICKS,
  type AccessLevel,
} from './connectorChoice';

type Option = {
  level: AccessLevel;
  title: string;
  description?: string;
  warning?: string;
};

/** The built-in presets in the artboard's plain words; others by their label. */
function presetOption(preset: ToolsetPreset): Option {
  const level = presetSelector(preset.name);
  if (level === PRESET_READ_ONLY) {
    return {
      level,
      title: 'Look things up · recommended',
      description: 'Uses only the read-only tools of every connector.',
    };
  }
  if (level === PRESET_FULL) {
    return {
      level,
      title: 'Look things up and make changes',
      warning:
        'Full gateway includes every tool, platform administration included. Choose deliberately.',
    };
  }
  return {
    level,
    title: presetLabel(preset.name),
    description: preset.description,
  };
}

/**
 * The step's access level as a radio (T81): *Nothing outside the chat*
 * first, then the presets (safe first, *Full gateway* last), then *Only the
 * tools I choose below* — no preset, which is a toolset too. A preset is the
 * base the connectors and tools below add to.
 */
export function AccessLevelCards({
  presets,
  level,
  onPick,
}: {
  presets: ToolsetPreset[];
  level: AccessLevel;
  onPick: (level: AccessLevel) => void;
}) {
  const options: Option[] = [
    { level: ACCESS_CHAT_ONLY, title: 'Nothing outside the chat' },
    ...presets.map(presetOption),
    { level: ACCESS_OWN_PICKS, title: 'Only the tools I choose below' },
  ];
  return (
    <SelectableCardGrid
      role="radiogroup"
      ariaLabel="What it may do"
      minWidth={260}
    >
      {options.map(option => (
        <SelectableCard
          key={option.level}
          role="radio"
          selected={option.level === level}
          ariaLabel={option.title.replace(' · recommended', '')}
          // A radio: picking the chosen option again changes nothing.
          onSelect={() => option.level !== level && onPick(option.level)}
        >
          <Text weight="bold">{option.title}</Text>
          {option.description && (
            <Text variant="body-small" color="secondary">
              {option.description}
            </Text>
          )}
          {option.warning && (
            <Text variant="body-small" color="danger">
              {option.warning}
            </Text>
          )}
        </SelectableCard>
      ))}
    </SelectableCardGrid>
  );
}
