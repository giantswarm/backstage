import { TextAreaField } from '@giantswarm/backstage-plugin-ui-react';

/** The admins as typed: one name per line, a field for each kind. */
export type OrganizationAdminsText = {
  groups: string;
  users: string;
};

export type OrganizationAdminsFieldsProps = {
  value: OrganizationAdminsText;
  onChange: (value: OrganizationAdminsText) => void;
};

/**
 * The two fields that name an organization's admins: identity provider
 * groups first, then people when no group fits, one per line. The admins
 * go into the `Organization` (`spec.admins`); none at all is valid.
 */
export function OrganizationAdminsFields({
  value,
  onChange,
}: OrganizationAdminsFieldsProps) {
  return (
    <>
      <TextAreaField
        label="Admin groups"
        secondaryLabel="(optional)"
        description="Identity provider groups, one per line, as the cluster sees them. Prefer a group: its members then change in the identity provider."
        rows={3}
        value={value.groups}
        onChange={groups => onChange({ ...value, groups })}
      />
      <TextAreaField
        label="Admin people"
        secondaryLabel="(optional)"
        description="User names, one per line, as the cluster sees them, when no group fits."
        rows={3}
        value={value.users}
        onChange={users => onChange({ ...value, users })}
      />
    </>
  );
}
