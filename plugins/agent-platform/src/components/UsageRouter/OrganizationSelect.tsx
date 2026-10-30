import { Select } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { tenantKindOf, tenantOf } from '../../lib/tenants';

/**
 * The class name on the select's root that does not change between builds,
 * for tests and app stylesheets to find it by without bui's own markup.
 */
export const ORGANIZATION_SELECT_CLASS_NAME =
  'agent-platform-usage-organization-select';

/** The option for every organization. Not a DNS label, so never a namespace. */
const ALL_ORGANIZATIONS = '*';

const useStyles = makeStyles({
  // Wide enough for an organization's name beside its chevron, and the same
  // height and label as the Environment and Time range selects beside it.
  root: {
    minWidth: 200,
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
function describe(namespace: string): string | undefined {
  switch (tenantKindOf(namespace)) {
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
 * namespace's agents. The options are namespaces, worded as the Agents list
 * words them under "Organization" (`tenantOf`): the organization's name,
 * `None` for the platform, `namespace <name>` for another namespace.
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
  const classes = useStyles();
  const offered =
    value !== undefined && !namespaces.includes(value)
      ? [...namespaces, value]
      : namespaces;

  return (
    <div className={`${classes.root} ${ORGANIZATION_SELECT_CLASS_NAME}`}>
      <Select
        label="Organization"
        selectedKey={value ?? ALL_ORGANIZATIONS}
        options={[
          { id: ALL_ORGANIZATIONS, label: 'All organizations' },
          ...offered.map(namespace => ({
            id: namespace,
            label: tenantOf(namespace),
            description: describe(namespace),
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
