import { Select } from '@backstage/ui';
import { ALL_ORGANIZATIONS } from '../../lib/customize';

export type OrganizationSelectProps = {
  /** The organizations (namespaces) to offer, in order. */
  organizations: string[];
  /** The selected organization, or `'all'`. */
  value: string;
  onChange: (organization: string) => void;
};

/**
 * Narrows a Customize tab to one organization, which is a Kubernetes
 * namespace. Renders nothing while there is no more than one to choose from
 * and nothing is selected.
 */
export function OrganizationSelect({
  organizations,
  value,
  onChange,
}: OrganizationSelectProps) {
  if (organizations.length < 2 && value === ALL_ORGANIZATIONS) {
    return null;
  }
  const options = [
    { id: ALL_ORGANIZATIONS, label: 'All organizations' },
    ...organizations.map(organization => ({
      id: organization,
      label: organization,
    })),
    ...(value === ALL_ORGANIZATIONS || organizations.includes(value)
      ? []
      : [{ id: value, label: value }]),
  ];
  return (
    <div style={{ minWidth: 200 }}>
      <Select
        label="Organization"
        options={options}
        selectedKey={value}
        onSelectionChange={key => {
          if (key !== null) {
            onChange(String(key));
          }
        }}
      />
    </div>
  );
}
