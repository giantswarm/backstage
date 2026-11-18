import { useRef, useState } from 'react';
import { Select, Tooltip, TooltipTrigger } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { OrganizationDirectory } from '../../lib/organizations';
import {
  namespacesSharingAName,
  tenantKindOf,
  tenantOf,
} from '../../lib/tenants';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

/**
 * The class name on the select's root that does not change between builds,
 * for tests and app stylesheets to find it by without bui's own markup.
 */
export const ORGANIZATION_SELECT_CLASS_NAME =
  'agent-platform-usage-organization-select';

/** The option for every organization. Not a DNS label, so never a namespace. */
const ALL_ORGANIZATIONS = '*';

const ALL_ORGANIZATIONS_LABEL = 'All organizations';

/**
 * The select's width, whichever organization is selected: wide enough for
 * "All organizations" beside its chevron. A longer name is cut short with an
 * ellipsis (bui's `SelectValue`) rather than widening the header's row of
 * controls until it wraps. The whole name is in a tooltip on hover and
 * keyboard focus, when it is cut short, and in the open list, which is at
 * least this wide and wraps a name the screen is too narrow for
 * (`agent-shell.css`), so a touch screen shows it too.
 */
export const ORGANIZATION_SELECT_WIDTH = 200;

const useStyles = makeStyles({
  // The same height and label as the Environment and Time range selects
  // beside it; never wider than a narrow header row.
  root: {
    width: ORGANIZATION_SELECT_WIDTH,
    maxWidth: '100%',
  },
});

export type OrganizationSelectProps = {
  /** The namespaces on offer, in the order to show them. */
  namespaces: string[];
  /** The selected namespace, or `undefined` for every organization. */
  value: string | undefined;
  onChange: (namespace: string | undefined) => void;
};

/**
 * The line under an option's name: what the platform is, since "None" alone
 * says little in a list of organizations; an organization's namespace, which
 * its name is not; for another namespace, its namespace only when another
 * option reads the same (`org-acme` and `agents-acme-x7k2q` both read
 * `acme`, `org-team-x` and `team-x` both `team-x`), so the two never look
 * like one, and nothing otherwise.
 */
function describe(
  namespace: string,
  directory: OrganizationDirectory,
  sharesItsName: boolean,
): string | undefined {
  switch (tenantKindOf(namespace, directory)) {
    case 'platform':
      return 'Platform: agents available to every organization';
    case 'organization':
      return namespace;
    default:
      return sharesItsName ? namespace : undefined;
  }
}

/** Whether the select's box cuts the selected name short. */
function cutsNameShort(root: HTMLElement | null): boolean {
  const value = root?.querySelector('.bui-SelectValue');
  return Boolean(value && value.scrollWidth > value.clientWidth);
}

/**
 * The Usage screen's Organization scope: every organization, or one
 * namespace's agents. The options are namespaces, each named as an
 * organization as every Organization label names it (`tenantOf`): the
 * organization's name, `None` for the platform, a Giant Swarm organization's
 * name for its `org-<name>` namespace, any other namespace as it is. The URL
 * and the queries keep the namespace; only the text shown changes.
 *
 * A selection the options do not hold (a deep link to a namespace with no
 * calls and no agents) is kept as an option, so the control shows the scope
 * the page is actually on.
 */
export function OrganizationSelect({
  namespaces,
  value,
  onChange,
}: OrganizationSelectProps) {
  const { directory } = useOrganizationDirectory();
  const classes = useStyles();
  const offered =
    value !== undefined && !namespaces.includes(value)
      ? [...namespaces, value]
      : namespaces;
  const labelled = offered.map(namespace => ({
    namespace,
    label: tenantOf(namespace, directory),
  }));
  const sharingAName = namespacesSharingAName(offered, directory);
  const selectedLabel =
    labelled.find(option => option.namespace === value)?.label ??
    ALL_ORGANIZATIONS_LABEL;

  // The tooltip opens only where the box cuts the name short, measured as it
  // would open: the box keeps its width, so nothing else changes that.
  const rootRef = useRef<HTMLDivElement>(null);
  const [showsFullName, setShowsFullName] = useState(false);

  return (
    <div
      ref={rootRef}
      className={`${classes.root} ${ORGANIZATION_SELECT_CLASS_NAME}`}
    >
      <TooltipTrigger
        isOpen={showsFullName}
        onOpenChange={isOpen =>
          setShowsFullName(isOpen && cutsNameShort(rootRef.current))
        }
      >
        <Select
          label="Organization"
          selectedKey={value ?? ALL_ORGANIZATIONS}
          options={[
            { id: ALL_ORGANIZATIONS, label: ALL_ORGANIZATIONS_LABEL },
            ...labelled.map(({ namespace, label }) => ({
              id: namespace,
              label,
              description: describe(
                namespace,
                directory,
                sharingAName.has(namespace),
              ),
            })),
          ]}
          onSelectionChange={key => {
            const next = key === null ? ALL_ORGANIZATIONS : String(key);
            onChange(next === ALL_ORGANIZATIONS ? undefined : next);
          }}
        />
        <Tooltip>{selectedLabel}</Tooltip>
      </TooltipTrigger>
    </div>
  );
}
