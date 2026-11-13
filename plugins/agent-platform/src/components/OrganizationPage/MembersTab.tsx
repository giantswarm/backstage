import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Cell,
  CellText,
  type ColumnConfig,
  Flex,
  Radio,
  RadioGroup,
  Select,
  Table,
  Text,
  TextField,
} from '@backstage/ui';
import {
  ConfirmDialog,
  PageSection,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useOrganizationMembers,
  useOrganizationMemberWrites,
} from '../../hooks/useOrganization';
import { useOrganizationAccess } from '../../hooks/useOrganizationAccess';
import {
  FIRST_ADMINS_BINDING,
  MEMBER_ROLE_DESCRIPTIONS,
  MEMBER_ROLES,
  memberKindLabel,
  type MemberRequest,
  type MemberRole,
  type OrganizationMember,
} from '../../lib/organizations';

/** A group comes first: membership then changes in the identity provider. */
type MemberKind = 'group' | 'person';

type MemberRow = OrganizationMember & { id: string };

function memberRequest(
  namespace: string,
  kind: MemberKind,
  name: string,
  role?: MemberRole,
): MemberRequest {
  return kind === 'group'
    ? { namespace, group: name, ...(role ? { role } : {}) }
    : { namespace, user: name, ...(role ? { role } : {}) };
}

/** The form that binds a group (first) or a person to a role. */
function AddMember({
  installation,
  namespace,
  changesDisabledBy,
}: {
  installation: string;
  namespace: string;
  changesDisabledBy?: string;
}) {
  const off = changesDisabledBy !== undefined;
  const { add } = useOrganizationMemberWrites(installation, namespace);
  const [kind, setKind] = useState<MemberKind>('group');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('user');
  const trimmed = name.trim();
  const noun = kind === 'group' ? 'group' : 'person';
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);
  const nameError = trimmed
    ? undefined
    : `Enter the ${noun === 'group' ? "group's name" : "person's user name"}.`;

  return (
    <Flex direction="column" gap="3" ref={scope}>
      <RadioGroup
        label="Add"
        orientation="horizontal"
        isDisabled={off}
        aria-describedby={changesDisabledBy}
        value={kind}
        onChange={value => {
          setKind(value as MemberKind);
          add.reset();
        }}
      >
        <Radio value="group">A group</Radio>
        <Radio value="person">A person, when no group fits</Radio>
      </RadioGroup>
      <Flex direction="column" gap="3" align="start">
        <TextField
          label={kind === 'group' ? 'Group' : 'Person'}
          description={
            kind === 'group'
              ? 'An identity provider group, as the cluster sees it. Its members change in the identity provider.'
              : 'Their user name, as the cluster sees it.'
          }
          isRequired
          isDisabled={off}
          value={name}
          onChange={setName}
          {...validation.textFieldProps('name', nameError)}
        />
        <Select
          label="Role"
          isDisabled={off}
          selectedKey={role}
          options={MEMBER_ROLES.map(id => ({
            id,
            label: `${id}: ${MEMBER_ROLE_DESCRIPTIONS[id]}`,
          }))}
          onSelectionChange={key => {
            if (key) {
              setRole(key as MemberRole);
            }
          }}
        />
        <Button
          variant="primary"
          isDisabled={off || add.isPending}
          aria-describedby={changesDisabledBy}
          onPress={() => {
            if (nameError) {
              validation.reveal();
              return;
            }
            add.mutate(memberRequest(namespace, kind, trimmed, role), {
              onSuccess: () => setName(''),
            });
          }}
        >
          {add.isPending ? 'Adding…' : `Add ${noun}`}
        </Button>
      </Flex>
      {add.error && (
        <Alert
          status="danger"
          title={`Could not add the ${noun}`}
          description={add.error.message}
        />
      )}
    </Flex>
  );
}

/**
 * An organization's members: the groups and people bound to its roles, as
 * agent-manager reads its RoleBindings (`list_organization_members`), groups
 * first. Adding offers a group first and a person second; a removal agent-
 * manager refuses, such as the last admin of `organization-admins`, which
 * admission keeps, is shown with its reason. With `changesDisabledBy` (the
 * id of the line that says why, on Pending erase) the members stay listed and
 * every change is off.
 */
export function MembersTab({
  installation,
  namespace,
  changesDisabledBy,
}: {
  installation: string;
  namespace: string;
  changesDisabledBy?: string;
}) {
  const members = useOrganizationMembers(installation, namespace);
  const { remove } = useOrganizationMemberWrites(installation, namespace);
  const access = useOrganizationAccess(installation, namespace);
  const [removing, setRemoving] = useState<MemberRow>();

  const columns: ColumnConfig<MemberRow>[] = [
    {
      id: 'kind',
      label: 'Kind',
      defaultWidth: '1fr',
      cell: row => <CellText title={memberKindLabel(row.kind)} />,
    },
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      defaultWidth: '3fr',
      cell: row => <CellText title={row.name} />,
    },
    {
      id: 'role',
      label: 'Role',
      defaultWidth: '1fr',
      cell: row => <CellText title={row.role} />,
    },
    {
      id: 'binding',
      label: 'Binding',
      defaultWidth: '2fr',
      cell: row => (
        <CellText
          title={row.binding}
          description={
            row.binding === FIRST_ADMINS_BINDING
              ? 'the first admins; its last admin stays'
              : undefined
          }
        />
      ),
    },
    {
      id: 'actions',
      label: '',
      defaultWidth: '1fr',
      // Only a group or a person is added or removed here; another
      // subject (a ServiceAccount) is changed where it was bound.
      cell: row =>
        access.members && (row.kind === 'Group' || row.kind === 'User') ? (
          <Cell>
            <Button
              size="small"
              variant="secondary"
              aria-label={`Remove ${row.name} as ${row.role}`}
              isDisabled={changesDisabledBy !== undefined}
              aria-describedby={changesDisabledBy}
              onPress={() => {
                remove.reset();
                setRemoving(row);
              }}
            >
              Remove
            </Button>
          </Cell>
        ) : (
          <CellText title="" />
        ),
    },
  ];

  let body;
  if (members.isLoading || access.isLoading) {
    body = <Text color="secondary">Reading the members…</Text>;
  } else if (members.failure) {
    body = (
      <Alert
        status="warning"
        title="Could not read the members"
        description={members.failure.message}
      />
    );
  } else if ((members.data ?? []).length === 0) {
    body = <Text color="secondary">No group or person is bound yet.</Text>;
  } else {
    body = (
      <Table<MemberRow>
        columnConfig={columns}
        data={(members.data ?? []).map(member => ({
          ...member,
          id: `${member.binding}/${member.kind}/${member.name}`,
        }))}
        pagination={{ type: 'none' }}
      />
    );
  }

  return (
    <Flex direction="column" gap="5">
      <PageSection
        title="Members"
        description="Admins manage members, models and credentials; editors create agents; users use them."
      >
        {body}
      </PageSection>
      <ConfirmDialog
        // Closed when the changes turn off: its confirm would write.
        isOpen={removing !== undefined && changesDisabledBy === undefined}
        onOpenChange={open => {
          if (!open) {
            setRemoving(undefined);
          }
        }}
        title={
          removing
            ? `Remove ${memberKindLabel(removing.kind).toLowerCase()} "${removing.name}"?`
            : ''
        }
        confirmLabel="Remove"
        busyLabel="Removing…"
        destructive
        isBusy={remove.isPending}
        error={
          remove.error && removing ? (
            <>
              <strong>{removing.name} was not removed.</strong>{' '}
              {remove.error.message}
            </>
          ) : undefined
        }
        onConfirm={() => {
          if (!removing) {
            return;
          }
          remove.mutate(
            memberRequest(
              namespace,
              removing.kind === 'Group' ? 'group' : 'person',
              removing.name,
              removing.role,
            ),
            { onSuccess: () => setRemoving(undefined) },
          );
        }}
      >
        {removing && (
          <Text>
            {removing.name} loses the {removing.role} role in this organization.
          </Text>
        )}
      </ConfirmDialog>
      {access.members && (
        <PageSection title="Add a member">
          <AddMember
            installation={installation}
            namespace={namespace}
            changesDisabledBy={changesDisabledBy}
          />
        </PageSection>
      )}
    </Flex>
  );
}
