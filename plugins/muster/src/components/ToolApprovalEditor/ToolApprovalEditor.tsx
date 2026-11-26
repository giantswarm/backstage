import { useCallback, useId, useMemo, useState } from 'react';
import {
  Button,
  Flex,
  Text,
  VisuallyHidden,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import { Pencil } from 'lucide-react';
import {
  CatalogNoMatch,
  countNoun,
  isSearchableList,
  ShowMore,
  type CatalogFacet,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  APPROVAL_PRESET_HINTS,
  APPROVAL_PRESET_LABELS,
  APPROVAL_PRESETS,
  APPROVAL_RULE_BLOCK_HINT,
  APPROVAL_RULE_HINT,
  APPROVAL_RULES,
  type ApprovalRule,
  type ApprovalSetting,
  APPROVAL_SETTING_HINTS,
  APPROVAL_SETTINGS,
  reportedSetting,
  type ApprovalPreset,
} from '../../lib/toolApproval';
import {
  ApprovalBadge,
  ApprovalPills,
  EffectBadge,
  MarkerBadge,
  toolApprovalFacet,
  toolEffectFacet,
  ToolListToolbar,
  useToolListFilter,
} from '../shared';
import type { ApprovalRow, ToolApprovalDraft } from './useToolApprovalDraft';

/**
 * How many tools the list shows first, and how many each *Show more* adds,
 * as the Test step's preview did.
 */
const TOOL_PAGE = 6;

/**
 * The same "What it does" dropdown as the connector's Tools tab; a tool muster
 * does not list counts nowhere.
 */
const EFFECT_FACET: CatalogFacet<ApprovalRow> = toolEffectFacet<ApprovalRow>(
  row => {
    if (!row.listed) {
      return undefined;
    }
    return row.readOnly ? 'reads' : 'changes';
  },
);

/** Whether a row answers the search: as the Tools tab's, by name or text. */
function rowMatches(row: ApprovalRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.key, row.name, row.summary].some(value =>
    value?.toLowerCase().includes(q),
  );
}

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  heading: {
    margin: 0,
  },
  control: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 6,
  },
  legend: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 4,
  },
  toolHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'var(--bui-fg-secondary)',
    paddingBottom: 6,
    paddingLeft: 10,
    borderBottom: '1px solid var(--bui-border-1)',
  },
  // The pills wrap under the name at phone width rather than squeezing it.
  tool: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 8,
    padding: '11px 0 11px 10px',
    borderBottom: '1px solid var(--bui-border-1)',
    fontSize: 14,
  },
  // An unsaved change: an accent edge on the row, in the warning
  // tone. Decorative; the "Edited" text carries the meaning.
  toolEdited: {
    boxShadow: 'inset 3px 0 0 var(--bui-fg-warning)',
  },
  editedGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    columnGap: 4,
    width: 0,
    minWidth: '100%',
    textAlign: 'right',
  },
  edited: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    // Primary text on the surface: contrast holds in light and dark.
    color: 'var(--bui-fg-primary)',
    '& svg': { width: 12, height: 12 },
  },
  // An unbroken snake_case tool name wraps inside its column.
  toolText: {
    flex: '1 1 220px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  markers: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  // The control keeps its place on every row; the edit marker stacks under
  // it without widening the column (zero basis, as wide as the control).
  toolSetting: {
    flex: 'none',
    alignSelf: 'flex-start',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
});

export type ToolApprovalEditorProps = {
  approval: ToolApprovalDraft;
  /**
   * `edit` for a connector admin: presets, the rule and a pill group per
   * tool. `read` for everyone else: each tool's setting as a badge, no
   * controls at all.
   */
  view: 'edit' | 'read';
  /** Shown under the list when muster listed only some of the tools. */
  partialNote?: string;
  /** The rule's choices muster takes (`ruleOptionsOf`); all by default. */
  ruleOptions?: readonly ApprovalRule[];
};

/**
 * A tool's markers beside its name: what it does (a property of the tool),
 * New, and why it is listed. An unsaved change is not here: it is edit state
 * and sits under the setting ({@link EditedMarker}).
 */
function RowMarkers({
  row,
  unmatched,
}: {
  row: ApprovalRow;
  unmatched: boolean;
}) {
  const classes = useStyles();
  return (
    <span className={classes.markers}>
      <Text weight="bold">{row.key}</Text>
      {row.listed && (
        <EffectBadge effect={row.readOnly ? 'reads' : 'changes'} />
      )}
      {row.isNew && <MarkerBadge tone="neutral">New</MarkerBadge>}
      {unmatched && (
        <MarkerBadge tone="neutral">Doesn't match the filter now</MarkerBadge>
      )}
    </span>
  );
}

/**
 * The edit state of a row: this setting differs from the saved one (or, on a
 * first review, from the preset's fill) and is not saved yet. Plain text with
 * a pencil and a small Reset, as one line under the control it describes, not
 * a badge like the tool's effect.
 */
function EditedMarker({
  was,
  tool,
  onReset,
}: {
  was: ApprovalSetting;
  tool: string;
  onReset: () => void;
}) {
  const classes = useStyles();
  const hint = `Unsaved change: this tool was ${was}. Reset puts it back.`;
  return (
    <span className={classes.editedGroup}>
      <span className={classes.edited} title={hint}>
        <Pencil aria-hidden />
        <span>Edited, was {was}</span>
        <VisuallyHidden>{`. ${hint}`}</VisuallyHidden>
      </span>
      <Button
        size="small"
        variant="tertiary"
        aria-label={`Reset ${tool} to ${was}`}
        onPress={onReset}
      >
        Reset
      </Button>
    </span>
  );
}

function rowDescription(row: ApprovalRow): string | undefined {
  if (!row.listed) {
    return 'Not listed by the connector right now. Blocked tools are hidden from every list.';
  }
  return row.summary;
}

/**
 * The tool approval half of the connector wizard's *Test & Tools* step, and
 * the same settings read-only for a person who is not a connector admin.
 * Picking a preset fills every tool's pill and the rule; what is saved is
 * the explicit setting of each tool. A row the person changed from the
 * saved setting (or, on a first review, from the preset's fill) is marked
 * *Edited, was Ask* under its setting and can be reset.
 */
export function ToolApprovalEditor({
  approval,
  view,
  partialNote,
  ruleOptions = APPROVAL_RULES,
}: ToolApprovalEditorProps) {
  const classes = useStyles();
  const { rows, draft, preset, reference } = approval;
  const editing = view === 'edit';

  // Search and filters only narrow what is listed: the draft keeps every
  // tool's setting, and the saved settings are the draft's, shown or not.
  const [query, setQuery] = useState('');
  const matches = useCallback(
    (row: ApprovalRow) => rowMatches(row, query),
    [query],
  );
  // What a row shows as its setting: the draft's while editing, what muster
  // reports in the read-only view. The facet reads it, so its counts follow
  // the pills.
  const settingOf = useCallback(
    (row: ApprovalRow): ApprovalSetting =>
      !editing && row.reported
        ? reportedSetting(row.reported)
        : (draft.tools[row.key] ?? draft.rule),
    [editing, draft],
  );
  const facets = useMemo(
    () => [EFFECT_FACET, toolApprovalFacet<ApprovalRow>(settingOf)],
    [settingOf],
  );
  const { filters, shown, isNarrowed } = useToolListFilter({
    items: rows,
    matches,
    facets,
  });

  // A row whose setting is changed while a filter is active stays listed
  // (it may no longer match) until the search or a filter changes, so the
  // pill just clicked does not take its row away.
  const listKey = `${filters.key}|${query}`;
  const [sticky, setSticky] = useState<{ key: string; rows: Set<string> }>({
    key: listKey,
    rows: new Set(),
  });
  const stuck = sticky.key === listKey ? sticky.rows : undefined;
  const keepListed = (keys: readonly string[]) => {
    if (isNarrowed) {
      setSticky({ key: listKey, rows: new Set([...(stuck ?? []), ...keys]) });
    }
  };
  const changeTool = (key: string, setting: ApprovalSetting) => {
    keepListed([key]);
    approval.setTool(key, setting);
  };
  const matching = useMemo(() => new Set(shown.map(row => row.key)), [shown]);
  const visibleRows = useMemo(
    () =>
      stuck
        ? rows.filter(row => matching.has(row.key) || stuck.has(row.key))
        : shown,
    [rows, shown, matching, stuck],
  );
  const searchable = isSearchableList(rows.length, isNarrowed);
  const hidden = rows.length - visibleRows.length;
  const presetHint = preset ? APPROVAL_PRESET_HINTS[preset] : undefined;
  const toolbar = searchable && (
    <ToolListToolbar
      query={query}
      onQueryChange={setQuery}
      total={rows.length}
      filters={filters}
    />
  );

  const heading = (
    <Flex direction="column" gap="1">
      <h3 className={classes.heading}>
        <Text variant="title-x-small">Tools</Text>
      </h3>
      <Text variant="body-small" color="secondary">
        {editing
          ? 'Choose which tools run, which ask a person first and which are hidden. Muster applies this to everyone who uses the connector: people, agents and their clients.'
          : 'Which tools run, which ask a person first and which are hidden, for everyone who uses the connector.'}
      </Text>
    </Flex>
  );

  // Each pill is described by its setting's line here.
  const legendId = useId();
  const hintIds = Object.fromEntries(
    APPROVAL_SETTINGS.map(setting => [setting, `${legendId}-${setting}`]),
  ) as Record<ApprovalSetting, string>;
  const legend = (
    <ul className={classes.legend} aria-label="What the settings mean">
      {APPROVAL_SETTINGS.map(setting => (
        <li key={setting}>
          <Text variant="body-small" color="secondary">
            <strong>{setting}</strong> —{' '}
            <span id={hintIds[setting]}>{APPROVAL_SETTING_HINTS[setting]}</span>
          </Text>
        </li>
      ))}
    </ul>
  );

  const list = (
    <div>
      <div className={classes.toolHeader}>
        <span>Tool</span>
        <span>Setting</span>
      </div>
      {visibleRows.length === 0 && (
        <CatalogNoMatch
          plural="tools"
          search={query}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clear}
        />
      )}
      <ShowMore
        key={listKey}
        items={visibleRows}
        initial={TOOL_PAGE}
        noun="tool"
      >
        {visible => (
          <div role="list" aria-label="Tool settings">
            {visible.map(row => {
              const setting = draft.tools[row.key] ?? draft.rule;
              const saved = reference(row.key);
              const changed =
                editing && saved !== undefined && saved !== setting;
              const description = rowDescription(row);
              return (
                <div
                  key={row.key}
                  role="listitem"
                  className={[classes.tool, changed && classes.toolEdited]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={classes.toolText}>
                    <RowMarkers row={row} unmatched={!matching.has(row.key)} />
                    {description && (
                      <Text variant="body-small" color="secondary">
                        {description}
                      </Text>
                    )}
                  </span>
                  <span className={classes.toolSetting}>
                    {editing ? (
                      <>
                        <ApprovalPills
                          aria-label={`Approval for ${row.key}`}
                          hintIds={hintIds}
                          options={APPROVAL_SETTINGS}
                          value={setting}
                          onChange={next => changeTool(row.key, next)}
                        />
                        {changed && saved !== undefined && (
                          <EditedMarker
                            was={saved}
                            tool={row.key}
                            onReset={() => {
                              keepListed([row.key]);
                              approval.resetTool(row.key);
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <ApprovalBadge
                        setting={
                          row.reported ? reportedSetting(row.reported) : setting
                        }
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ShowMore>
      {hidden > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {editing
            ? `${hidden} of ${rows.length} tools are hidden by the search or filter. They keep their settings and are saved with the rest.`
            : `${hidden} of ${rows.length} tools are hidden by the search or filter.`}
        </Text>
      )}
      {partialNote && (
        <Text as="p" variant="body-small" color="secondary">
          {partialNote}
        </Text>
      )}
    </div>
  );

  if (!editing) {
    return (
      <section className={classes.section} aria-label="Tool settings">
        {heading}
        {legend}
        {toolbar}
        {list}
      </section>
    );
  }

  return (
    <section className={classes.section} aria-label="Tool settings">
      {heading}
      {toolbar}
      <div className={classes.control}>
        <Text variant="body-small" weight="bold" id="tool-approval-preset">
          {isNarrowed
            ? `Set the ${countNoun(shown.length, 'shown tool')} to`
            : 'Start from'}
        </Text>
        {isNarrowed ? (
          <ScopedPresets
            labelledBy="tool-approval-preset"
            disabled={shown.length === 0}
            onApply={next => {
              // Only the tools the search and filter match; a row that stops
              // matching stays listed, marked.
              const keys = shown.map(row => row.key);
              keepListed(keys);
              approval.applyPreset(next, keys);
            }}
          />
        ) : (
          <ToggleButtonGroup
            aria-labelledby="tool-approval-preset"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={preset ? [preset] : []}
            onSelectionChange={keys => {
              const next = [...keys][0] as ApprovalPreset | undefined;
              if (next) {
                approval.applyPreset(next);
              }
            }}
          >
            {APPROVAL_PRESETS.map(option => (
              <ToggleButton
                key={option}
                id={option}
                size="small"
                iconStart={
                  option === preset ? <CheckIcon aria-hidden /> : undefined
                }
              >
                {APPROVAL_PRESET_LABELS[option]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
        <Text variant="body-small" color="secondary">
          {isNarrowed
            ? `Applies to the ${shown.length} shown only: the other ${rows.length - shown.length} and the rule for new tools keep their settings.`
            : (presetHint ??
              'Your own settings. A preset fills every tool again.')}
        </Text>
      </div>
      {legend}
      <div className={classes.control}>
        <Text variant="body-small" weight="bold">
          New tools
        </Text>
        <ApprovalPills
          aria-label="Rule for new tools"
          hintIds={hintIds}
          options={
            ruleOptions.includes(draft.rule)
              ? ruleOptions
              : [...ruleOptions, draft.rule]
          }
          value={draft.rule}
          onChange={approval.setRule}
        />
        <Text variant="body-small" color="secondary">
          {draft.rule === 'Block'
            ? APPROVAL_RULE_BLOCK_HINT
            : APPROVAL_RULE_HINT}
        </Text>
      </div>
      {list}
    </section>
  );
}

/**
 * The presets while the list is narrowed: plain buttons that fill only the
 * shown tools, not a toggle group, since no preset describes the whole draft
 * then.
 */
function ScopedPresets({
  labelledBy,
  disabled,
  onApply,
}: {
  labelledBy: string;
  disabled: boolean;
  onApply: (preset: ApprovalPreset) => void;
}) {
  return (
    <span role="group" aria-labelledby={labelledBy}>
      <Flex gap="2">
        {APPROVAL_PRESETS.map(option => (
          <Button
            key={option}
            size="small"
            variant="secondary"
            isDisabled={disabled}
            onPress={() => onApply(option)}
          >
            {APPROVAL_PRESET_LABELS[option]}
          </Button>
        ))}
      </Flex>
    </span>
  );
}
