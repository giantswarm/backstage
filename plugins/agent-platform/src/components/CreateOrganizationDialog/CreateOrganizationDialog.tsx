import { FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import {
  BusyDialog,
  useFieldValidation,
  useOnDialogOpen,
} from '@giantswarm/backstage-plugin-ui-react';

import { useOrganizationCreation } from '../../hooks/useOrganization';
import {
  namesPerLine,
  ORGANIZATION_NAME_MAX_LENGTH,
  organizationNameProblem,
} from '../../lib/organizations';
import { organizationDetailRouteRef } from '../../routes';
import { DIALOG_FORM_STYLE } from '../dialogForm';
import {
  OrganizationAdminsFields,
  type OrganizationAdminsText,
} from '../OrganizationAdminsFields';

export type CreateOrganizationDialogProps = {
  /** The installations where the person may create an organization. */
  installations: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const NO_ADMINS: OrganizationAdminsText = { groups: '', users: '' };

/**
 * Creates an organization: its name, a display name and its admins, which
 * agent-manager writes into one `Organization` with the Agent Platform on
 * (`create_organization`). agent-manager does not wait for the operator, so
 * the person lands on the new organization's page at once, which says it is
 * not ready until the operator reports it, with agent-manager's `next`.
 */
export function CreateOrganizationDialog({
  installations,
  isOpen,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const [chosen, setChosen] = useState<string>();
  const installation =
    chosen && installations.includes(chosen) ? chosen : installations[0];
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [admins, setAdmins] = useState<OrganizationAdminsText>(NO_ADMINS);
  const create = useOrganizationCreation(installation);
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope, { isOpen });
  const navigate = useNavigate();
  const organizationLink = useRouteRef(organizationDetailRouteRef);

  // Each opening starts a new organization.
  useOnDialogOpen(isOpen, () => {
    setName('');
    setDisplayName('');
    setAdmins(NO_ADMINS);
    create.reset();
  });

  const trimmed = name.trim();
  const nameError = organizationNameProblem(trimmed);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending || !installation) {
      return;
    }
    if (nameError) {
      validation.reveal();
      return;
    }
    create.mutate(
      {
        name: trimmed,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        adminGroups: namesPerLine(admins.groups),
        adminUsers: namesPerLine(admins.users),
      },
      {
        onSuccess: result => {
          onOpenChange(false);
          const href = organizationLink?.({
            installation,
            name: result.organization.name || trimmed,
          });
          if (href) {
            navigate(href, {
              state: result.next ? { createdNext: result.next } : undefined,
            });
          }
        },
      },
    );
  };

  return (
    <BusyDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isBusy={create.isPending}
      width="min(90vw, 560px)"
    >
      {close => (
        <form onSubmit={handleSubmit} noValidate style={DIALOG_FORM_STYLE}>
          <DialogHeader>Create organization</DialogHeader>
          <DialogBody>
            <Flex direction="column" gap="3" ref={scope}>
              {installations.length > 1 ? (
                <Select
                  label="Environment"
                  isRequired
                  options={installations.map(id => ({ id, label: id }))}
                  selectedKey={installation ?? null}
                  onSelectionChange={key => {
                    if (key) {
                      setChosen(String(key));
                      create.reset();
                    }
                  }}
                />
              ) : (
                <Text variant="body-medium">
                  The organization is created on {installation}.
                </Text>
              )}
              <TextField
                label="Name"
                description={`Lowercase letters, digits and hyphens, at most ${ORGANIZATION_NAME_MAX_LENGTH} characters, e.g. payments. It cannot be changed later.`}
                isRequired
                value={name}
                onChange={setName}
                autoComplete="off"
                {...validation.textFieldProps('name', nameError)}
                // The dialog was opened to type a name: the ARIA dialog
                // pattern focuses its first field.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <TextField
                label="Display name"
                secondaryLabel="(optional)"
                description="The name people see, e.g. Payments team."
                value={displayName}
                onChange={setDisplayName}
              />
              <Text variant="body-medium">
                The admins manage the organization&apos;s members, models and
                credentials. You can also add them later, on its page.
              </Text>
              <OrganizationAdminsFields value={admins} onChange={setAdmins} />
              {create.error && (
                <Alert
                  status="danger"
                  title="Could not create the organization"
                  description={create.error.message}
                />
              )}
            </Flex>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              isDisabled={create.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isPending={create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </BusyDialog>
  );
}
