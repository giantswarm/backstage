import { Select } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { OrganizationDirectory } from '../../lib/organizations';
import { organizationScopeLabelOf, tenantKindOf } from '../../lib/tenants';
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
 * controls until it wraps; the open list is at least this wide and grows to
 * show every name in full.
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
 * its name is not; nothing for another namespace, whose name says it.
 */
function describe(
  namespace: string,
  directory: OrganizationDirectory,
): string | undefined {
  switch (tenantKindOf(namespace, directory)) {
    case 'platform':
      return 'Platform: agents available to every organization';
    case 'organization':
      return namespace;
    default:
      return undefined;
  }
}

/**
 * The Usage screen's Organization scope: every organization, or one
 * namespace's agents. The options are namespaces, each named as an
 * organization (`organizationScopeLabelOf`): the organization's name, `None`
 * for the platform, a Giant Swarm organization's name for its `org-<name>`
 * namespace, any other namespace as it is. The URL and the queries keep the
 * namespace; only the text shown changes.
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
  const selectedLabel =
    value === undefined
      ? ALL_ORGANIZATIONS_LABEL
      : organizationScopeLabelOf(value, directory);

  return (
    <div
      className={`${classes.root} ${ORGANIZATION_SELECT_CLASS_NAME}`}
      // The whole name on hover, where the box cuts it short.
      title={selectedLabel}
    >
      <Select
        label="Organization"
        selectedKey={value ?? ALL_ORGANIZATIONS}
        options={[
          { id: ALL_ORGANIZATIONS, label: ALL_ORGANIZATIONS_LABEL },
          ...offered.map(namespace => ({
            id: namespace,
            label: organizationScopeLabelOf(namespace, directory),
            description: describe(namespace, directory),
          })),
        ]}
        onSelectionChange={key => {
          const next = key === null ? ALL_ORGANIZATIONS : String(key);
          onChange(next === ALL_ORGANIZATIONS ? undefined : next);
        }}
      />
    </div>
  );
}
