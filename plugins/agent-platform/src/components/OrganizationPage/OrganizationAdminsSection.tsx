import { FormEvent, useState } from 'react';
import {
  Alert,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import {
  BusyDialog,
  PageSection,
  useOnDialogOpen,
} from '@giantswarm/backstage-plugin-ui-react';

import { useOrganizationAdminsUpdate } from '../../hooks/useOrganization';
import {
  adminsOf,
  CONTENT_PULL_REQUEST_NEXT,
  CONTENT_PULL_REQUEST_UNCHANGED,
  namesPerLine,
  type ListedOrganization,
} from '../../lib/organizations';
import { DIALOG_FORM_STYLE } from '../dialogForm';
import {
  OrganizationAdminsFields,
  type OrganizationAdminsText,
} from '../OrganizationAdminsFields';
import { PullRequestOutcome } from '../PullRequestOutcome';

/** One kind of admin, named in a sentence, or "none". */
function namesOrNone(names: string[]): string {
  return names.length > 0 ? names.join(', ') : 'none';
}

/**
 * The organization's admins, as its `Organization` names them
 * (`spec.admins`, the summary `list_organizations` gives a person who
 * manages it), and, for that person, Change admins: `update_organization`
 * replaces the groups and the people with what the dialog holds, `[]`
 * removing them. The operator then binds them to `agent-platform:admin` in
 * the organization namespace, so the member list follows a little later.
 */
export function OrganizationAdminsSection({
  installation,
  organization,
  changesDisabledBy,
}: {
  installation: string;
  organization: ListedOrganization;
  changesDisabledBy?: string;
}) {
  const current = adminsOf(organization.organization?.admins);
  const [editing, setEditing] = useState(false);
  const mayChange = organization.permissions.manage;

  return (
    <PageSection
      title="Admins"
      description="The admins manage members, models and credentials. They are set on the organization, not added as members. The member list shows a change once the operator has bound them."
      action={
        mayChange ? (
          <Button
            variant="secondary"
            isDisabled={changesDisabledBy !== undefined}
            aria-describedby={changesDisabledBy}
            onPress={() => setEditing(true)}
          >
            Change admins
          </Button>
        ) : undefined
      }
    >
      <Flex direction="column" gap="1">
        <Text variant="body-medium">
          Groups: {namesOrNone(current.adminGroups)}
        </Text>
        <Text variant="body-medium">
          People: {namesOrNone(current.adminUsers)}
        </Text>
      </Flex>
      {mayChange && (
        <OrganizationAdminsDialog
          installation={installation}
          organization={organization}
          isOpen={editing && changesDisabledBy === undefined}
          onOpenChange={setEditing}
        />
      )}
    </PageSection>
  );
}

function OrganizationAdminsDialog({
  installation,
  organization,
  isOpen,
  onOpenChange,
}: {
  installation: string;
  organization: ListedOrganization;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const update = useOrganizationAdminsUpdate(installation, organization.name);
  const [admins, setAdmins] = useState<OrganizationAdminsText>({
    groups: '',
    users: '',
  });

  // Seeded when it opens, never while it is open: the listing is read
  // again under it.
  useOnDialogOpen(isOpen, () => {
    const current = adminsOf(organization.organization?.admins);
    setAdmins({
      groups: current.adminGroups.join('\n'),
      users: current.adminUsers.join('\n'),
    });
    update.reset();
  });

  const pullRequest = update.data?.commit;
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending || pullRequest) {
      return;
    }
    update.mutate(
      {
        organization,
        adminGroups: namesPerLine(admins.groups),
        adminUsers: namesPerLine(admins.users),
      },
      {
        // In mode commit the dialog stays with the pull request.
        onSuccess: result => {
          if (!result.commit) onOpenChange(false);
        },
      },
    );
  };

  return (
    <BusyDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isBusy={update.isPending}
      width="min(90vw, 560px)"
    >
      {close => (
        <form onSubmit={handleSubmit} noValidate style={DIALOG_FORM_STYLE}>
          <DialogHeader>Change admins</DialogHeader>
          <DialogBody>
            <Flex direction="column" gap="3">
              <Text variant="body-medium">
                These replace the admins of{' '}
                {organization.displayName || organization.name}. Leave both
                fields empty to remove every admin.
              </Text>
              <OrganizationAdminsFields value={admins} onChange={setAdmins} />
              {update.error && (
                <Alert
                  status="danger"
                  title="Could not change the admins"
                  description={update.error.message}
                />
              )}
              {pullRequest && (
                <PullRequestOutcome
                  commit={pullRequest}
                  next={CONTENT_PULL_REQUEST_NEXT}
                  unchanged={CONTENT_PULL_REQUEST_UNCHANGED}
                  testId="organization-admins-pull-request"
                />
              )}
            </Flex>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              isDisabled={update.isPending}
              onClick={close}
            >
              {pullRequest ? 'Close' : 'Cancel'}
            </Button>
            {!pullRequest && (
              <Button
                variant="primary"
                type="submit"
                isPending={update.isPending}
              >
                {update.isPending ? 'Saving…' : 'Save admins'}
              </Button>
            )}
          </DialogFooter>
        </form>
      )}
    </BusyDialog>
  );
}
