import {
  Button,
  Flex,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import { ShowMore } from '@giantswarm/backstage-plugin-ui-react';

import {
  APPROVAL_PRESET_HINTS,
  APPROVAL_PRESET_LABELS,
  APPROVAL_PRESETS,
  APPROVAL_RULE_BLOCK_HINT,
  APPROVAL_RULE_HINT,
  APPROVAL_RULES,
  type ApprovalRule,
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
} from '../shared';
import type { ApprovalRow, ToolApprovalDraft } from './useToolApprovalDraft';

/**
 * How many tools the list shows first, and how many each *Show more* adds,
 * as the Test step's preview did.
 */
const TOOL_PAGE = 6;

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
    borderBottom: '1px solid var(--bui-border-1)',
  },
  // The pills wrap under the name at phone width rather than squeezing it.
  tool: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 8,
    padding: '11px 0',
    borderBottom: '1px solid var(--bui-border-1)',
    fontSize: 14,
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
  toolSetting: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
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

/** A tool's markers beside its name: what it does, New, Changed. */
function RowMarkers({ row, changed }: { row: ApprovalRow; changed: boolean }) {
  const classes = useStyles();
  return (
    <span className={classes.markers}>
      <Text weight="bold">{row.key}</Text>
      {row.listed && (
        <EffectBadge effect={row.readOnly ? 'reads' : 'changes'} />
      )}
      {row.isNew && <MarkerBadge tone="neutral">New</MarkerBadge>}
      {changed && <MarkerBadge tone="warning">Changed</MarkerBadge>}
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
 * *Changed* and can be reset.
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

  const legend = (
    <ul className={classes.legend} aria-label="What the settings mean">
      {APPROVAL_SETTINGS.map(setting => (
        <li key={setting}>
          <Text variant="body-small" color="secondary">
            <strong>{setting}</strong> — {APPROVAL_SETTING_HINTS[setting]}
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
      <ShowMore items={rows} initial={TOOL_PAGE} noun="tool">
        {visible => (
          <div role="list" aria-label="Tool settings">
            {visible.map(row => {
              const setting = draft.tools[row.key] ?? draft.rule;
              const saved = reference(row.key);
              const changed =
                editing && saved !== undefined && saved !== setting;
              const description = rowDescription(row);
              return (
                <div key={row.key} role="listitem" className={classes.tool}>
                  <span className={classes.toolText}>
                    <RowMarkers row={row} changed={changed} />
                    {description && (
                      <Text variant="body-small" color="secondary">
                        {description}
                      </Text>
                    )}
                  </span>
                  <span className={classes.toolSetting}>
                    {editing ? (
                      <>
                        {changed && (
                          <Button
                            size="small"
                            variant="tertiary"
                            aria-label={`Reset ${row.key} to ${saved}`}
                            onPress={() => approval.resetTool(row.key)}
                          >
                            Reset
                          </Button>
                        )}
                        <ApprovalPills
                          aria-label={`Approval for ${row.key}`}
                          options={APPROVAL_SETTINGS}
                          value={setting}
                          onChange={next => approval.setTool(row.key, next)}
                        />
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
        {list}
      </section>
    );
  }

  return (
    <section className={classes.section} aria-label="Tool settings">
      {heading}
      <div className={classes.control}>
        <Text variant="body-small" weight="bold" id="tool-approval-preset">
          Start from
        </Text>
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
        <Text variant="body-small" color="secondary">
          {preset
            ? APPROVAL_PRESET_HINTS[preset]
            : 'Your own settings. A preset fills every tool again.'}
        </Text>
      </div>
      {legend}
      <div className={classes.control}>
        <Text variant="body-small" weight="bold">
          New tools
        </Text>
        <ApprovalPills
          aria-label="Rule for new tools"
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
