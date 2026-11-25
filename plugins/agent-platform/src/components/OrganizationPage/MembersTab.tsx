import { useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core';
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
  CONTENT_PULL_REQUEST_NEXT,
  CONTENT_PULL_REQUEST_UNCHANGED,
  MEMBER_FORM_ROLES,
  MEMBER_ROLE_DESCRIPTIONS,
  memberKindLabel,
  type ListedOrganization,
  type MemberFormRole,
  type MemberRequest,
  type OrganizationMember,
  type OrganizationNamespace,
} from '../../lib/organizations';
import { PullRequestOutcome } from '../PullRequestOutcome';
import { OrganizationAdminsSection } from './OrganizationAdminsSection';
import { WrappingCellText } from './WrappingCellText';

/** A group comes first: membership then changes in the identity provider. */
type MemberKind = 'group' | 'person';

type MemberRow = OrganizationMember & { id: string };

function memberRequest(
  organization: string,
  kind: MemberKind,
  name: string,
  role?: MemberFormRole,
): MemberRequest {
  return kind === 'group'
    ? { organization, group: name, ...(role ? { role } : {}) }
    : { organization, user: name, ...(role ? { role } : {}) };
}

const useStyles = makeStyles({
  // bui marks a disabled field box with `data-disabled` and only fades it,
  // and the agent shell paints every field box white with an edge: a
  // disabled one then looks like an active one next to the greyed radios
  // and button. It takes the look of a disabled bui secondary button (the
  // Remove buttons) instead: a raised neutral fill, no edge, the disabled
  // text colour.
  form: {
    '& .bui-Input[data-disabled], & .bui-SelectTrigger[data-disabled]': {
      opacity: 1,
      backgroundColor: 'var(--bui-bg-neutral-2)',
      boxShadow: 'none',
      color: 'var(--bui-fg-disabled)',
      cursor: 'not-allowed',
    },
    // The selector's value sets its own text colour.
    '& .bui-SelectTrigger[data-disabled] .bui-SelectValue': {
      color: 'var(--bui-fg-disabled)',
    },
  },
});

/** The form that binds a group (first) or a person to a role. */
function AddMember({
  installation,
  organization,
  changesDisabledBy,
}: {
  installation: string;
  organization: OrganizationNamespace;
  changesDisabledBy?: string;
}) {
  const classes = useStyles();
  const off = changesDisabledBy !== undefined;
  const { add } = useOrganizationMemberWrites(installation, organization);
  const [kind, setKind] = useState<MemberKind>('group');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberFormRole>('user');
  const trimmed = name.trim();
  const noun = kind === 'group' ? 'group' : 'person';
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);
  const nameError = trimmed
    ? undefined
    : `Enter the ${noun === 'group' ? "group's name" : "person's user name"}.`;

  return (
    <Flex direction="column" gap="3" ref={scope} className={classes.form}>
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
          aria-describedby={changesDisabledBy}
          value={name}
          onChange={setName}
          {...validation.textFieldProps('name', nameError)}
        />
        <Select
          label="Role"
          isDisabled={off}
          aria-describedby={changesDisabledBy}
          selectedKey={role}
          description="Admins are not added here: they are the organization's admins, above."
          options={MEMBER_FORM_ROLES.map(id => ({
            id,
            label: `${id}: ${MEMBER_ROLE_DESCRIPTIONS[id]}`,
          }))}
          onSelectionChange={key => {
            if (key) {
              setRole(key as MemberFormRole);
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
            add.mutate(
              memberRequest(organization.organization, kind, trimmed, role),
              { onSuccess: () => setName('') },
            );
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
      {add.data?.commit && (
        <PullRequestOutcome
          commit={add.data.commit}
          next={CONTENT_PULL_REQUEST_NEXT}
          unchanged={CONTENT_PULL_REQUEST_UNCHANGED}
          testId="organization-member-pull-request"
        />
      )}
    </Flex>
  );
}

/**
 * An organization's members: the groups and people bound to its roles, as
 * agent-manager reads its RoleBindings (`list_organization_members`), groups
 * first. The admins come from the `Organization` (`spec.admins`): they are
 * listed with the others, changed only in the Admins section, and never
 * offered as a role to add or as a member to remove. Adding offers a group
 * first and a person second, as an editor or a user; a refusal of
 * agent-manager is shown in its words. With `changesDisabledBy` (the id of
 * the line that says why, on Pending erase and while Erasing) the members
 * stay listed and every change is off.
 */
export function MembersTab({
  installation,
  organization,
  listed,
  changesDisabledBy,
}: {
  installation: string;
  /** The organization: its name, which the tools take, and its namespace. */
  organization: OrganizationNamespace;
  /** The organization as `list_organizations` lists it, if it does. */
  listed?: ListedOrganization;
  changesDisabledBy?: string;
}) {
  const members = useOrganizationMembers(
    installation,
    organization.organization,
  );
  const { remove } = useOrganizationMemberWrites(installation, organization);
  const access = useOrganizationAccess(installation, organization.namespace);
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
      // The note is read whole, so both lines wrap, at whole words: on a
      // phone the table scrolls inside its card rather than squeeze it.
      minWidth: 160,
      cell: row => (
        <WrappingCellText
          title={row.binding}
          description={row.from ? "from the organization's admins" : undefined}
        />
      ),
    },
    {
      id: 'actions',
      label: '',
      defaultWidth: '1fr',
      // "Remove" whole, on a phone too.
      minWidth: 100,
      // Only a group or a person is added or removed here, as an editor or
      // a user; an admin is changed in the Admins section, another subject
      // (a ServiceAccount) where it was bound.
      cell: row =>
        access.members &&
        row.role !== 'admin' &&
        (row.kind === 'Group' || row.kind === 'User') ? (
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
      {listed?.organization && (
        <OrganizationAdminsSection
          installation={installation}
          organization={listed}
          changesDisabledBy={changesDisabledBy}
        />
      )}
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
        isDone={Boolean(remove.data?.commit)}
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
              organization.organization,
              removing.kind === 'Group' ? 'group' : 'person',
              removing.name,
              removing.role === 'admin' ? undefined : removing.role,
            ),
            {
              // In mode commit the dialog stays with the pull request.
              onSuccess: result => {
                if (!result.commit) setRemoving(undefined);
              },
            },
          );
        }}
      >
        {removing && (
          <Flex direction="column" gap="3">
            <Text>
              {removing.name} loses the {removing.role} role in this
              organization.
            </Text>
            {remove.data?.commit && (
              <PullRequestOutcome
                commit={remove.data.commit}
                next={CONTENT_PULL_REQUEST_NEXT}
                unchanged={CONTENT_PULL_REQUEST_UNCHANGED}
                testId="organization-member-pull-request"
              />
            )}
          </Flex>
        )}
      </ConfirmDialog>
      {access.members && (
        <PageSection title="Add a member">
          <AddMember
            installation={installation}
            organization={organization}
            changesDisabledBy={changesDisabledBy}
          />
        </PageSection>
      )}
    </Flex>
  );
}
