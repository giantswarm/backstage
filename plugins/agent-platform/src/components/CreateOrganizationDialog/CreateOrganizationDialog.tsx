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
  Radio,
  RadioGroup,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import {
  BusyDialog,
  LoadingIndicator,
  useFieldValidation,
  useOnDialogOpen,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useOrganizationCreation } from '../../hooks/useOrganization';
import {
  CREATE_PULL_REQUEST_NEXT,
  modeArgument,
  namesPerLine,
  offersOrganizationPullRequests,
  ORGANIZATION_CREATE_MODE_DESCRIPTION,
  ORGANIZATION_CREATE_MODE_LABELS,
  ORGANIZATION_CREATE_MODES,
  ORGANIZATION_NAME_MAX_LENGTH,
  organizationNameProblem,
  type OrganizationWriteMode,
} from '../../lib/organizations';
import { organizationDetailRouteRef } from '../../routes';
import { DIALOG_FORM_STYLE } from '../dialogForm';
import {
  OrganizationAdminsFields,
  type OrganizationAdminsText,
} from '../OrganizationAdminsFields';
import { PullRequestOutcome } from '../PullRequestOutcome';

export type CreateOrganizationDialogProps = {
  /** The installations where the person may create an organization. */
  installations: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const NO_ADMINS: OrganizationAdminsText = { groups: '', users: '' };

const DEFAULT_CREATE_MODE = ORGANIZATION_CREATE_MODES[0];

/**
 * Creates an organization: its name, a display name and its admins, which
 * agent-manager writes into one `Organization` with the Agent Platform on
 * (`create_organization`). agent-manager does not wait for the operator, so
 * the person lands on the new organization's page at once, which says it is
 * not ready until the operator reports it, with agent-manager's `next`.
 *
 * Where the installation's agent-manager opens pull requests for
 * organizations, the person chooses how: a pull request (mode commit), after
 * which the dialog stays with the pull request and opens no page, since the
 * organization exists only once it is merged, or directly as above.
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
  const [chosenMode, setChosenMode] =
    useState<OrganizationWriteMode>(DEFAULT_CREATE_MODE);
  const create = useOrganizationCreation(installation);
  const info = useAgentManagerInfo(installation);
  // A failed read offers no choice: the create is direct, as it was.
  const offersPullRequest = offersOrganizationPullRequests(
    info.info?.capabilities,
  );
  const mode: OrganizationWriteMode = offersPullRequest ? chosenMode : 'apply';
  const pullRequest = create.data?.commit;
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope, { isOpen });
  const navigate = useNavigate();
  const organizationLink = useRouteRef(organizationDetailRouteRef);

  // Each opening starts a new organization.
  useOnDialogOpen(isOpen, () => {
    setName('');
    setDisplayName('');
    setAdmins(NO_ADMINS);
    setChosenMode(DEFAULT_CREATE_MODE);
    create.reset();
  });

  const trimmed = name.trim();
  const nameError = organizationNameProblem(trimmed);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending || pullRequest || info.isLoading || !installation) {
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
        ...modeArgument(mode),
      },
      {
        onSuccess: result => {
          // A pull request: the dialog stays with it, and no organization
          // exists yet to open.
          if (result.commit) {
            return;
          }
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
                      setChosenMode(DEFAULT_CREATE_MODE);
                      create.reset();
                    }
                  }}
                />
              ) : (
                <Text variant="body-medium">
                  {`The organization is created on the installation ${installation}.`}
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
                secondaryLabel="optional"
                description="The name people see, e.g. Payments team."
                value={displayName}
                onChange={setDisplayName}
              />
              <Text variant="body-medium">
                The admins manage the organization&apos;s members, models and
                credentials. You can also add them later, on its page.
              </Text>
              <OrganizationAdminsFields value={admins} onChange={setAdmins} />
              {info.isLoading && (
                <LoadingIndicator
                  label={`Reading how organizations are created on ${installation}…`}
                />
              )}
              {offersPullRequest && (
                <RadioGroup
                  label="How to create it"
                  description={ORGANIZATION_CREATE_MODE_DESCRIPTION}
                  isRequired
                  value={chosenMode}
                  onChange={value => {
                    setChosenMode(value as OrganizationWriteMode);
                    create.reset();
                  }}
                  isDisabled={create.isPending || Boolean(pullRequest)}
                >
                  {ORGANIZATION_CREATE_MODES.map(option => (
                    <Radio key={option} value={option}>
                      {ORGANIZATION_CREATE_MODE_LABELS[option]}
                    </Radio>
                  ))}
                </RadioGroup>
              )}
              {create.error && (
                <Alert
                  status="danger"
                  title="Could not create the organization"
                  description={create.error.message}
                />
              )}
              {pullRequest && (
                <PullRequestOutcome
                  commit={pullRequest}
                  next={CREATE_PULL_REQUEST_NEXT}
                  unchanged="git already holds this organization."
                  testId="organization-create-pull-request"
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
              {pullRequest ? 'Close' : 'Cancel'}
            </Button>
            {!pullRequest && (
              <Button
                variant="primary"
                type="submit"
                isPending={create.isPending}
                isDisabled={info.isLoading}
              >
                {submitLabel(mode, create.isPending)}
              </Button>
            )}
          </DialogFooter>
        </form>
      )}
    </BusyDialog>
  );
}

/** The submit button: the verb of the way chosen. */
function submitLabel(mode: OrganizationWriteMode, isPending: boolean): string {
  if (mode === 'commit') {
    return isPending ? 'Opening pull request…' : 'Open pull request';
  }
  return isPending ? 'Creating…' : 'Create organization';
}
