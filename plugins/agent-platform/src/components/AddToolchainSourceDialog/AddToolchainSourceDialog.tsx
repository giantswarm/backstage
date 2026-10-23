import { useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
  TextField,
} from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import {
  BusyDialog,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAddToolchainSource } from '../../hooks/useToolchainWrites';
import type { AddSourceResult } from '../../lib/toolchainManager';
import { DIALOG_FORM_STYLE } from '../dialogForm';
import { ToolchainGrantPrompt } from '../ToolchainGrantPrompt';

/** `owner/name`, or a github.com URL of it. */
const REPOSITORY_PATTERN =
  /^(https:\/\/github\.com\/)?[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/;

export type AddToolchainSourceDialogProps = {
  installation: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * `owner/name` from what the person entered: a github.com URL of it, or a
 * trailing slash, is the same repository.
 */
export function repositoryName(entered: string): string {
  return entered
    .trim()
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\/$/, '');
}

/** What the dialog says once the manager answered. */
function Outcome({
  installation,
  result,
  onConnected,
}: {
  installation: string;
  result: AddSourceResult;
  onConnected: () => void;
}) {
  if (result.source) {
    return (
      <Alert
        status="success"
        title={`${result.source.repository} added`}
        description={
          result.source.offered
            ? 'Its toolchains are offered as soon as its CI publishes them.'
            : 'Its toolchains are offered once an owner of the installation approves it.'
        }
      />
    );
  }
  return (
    <ToolchainGrantPrompt
      installation={installation}
      answer={result}
      onConnected={onConnected}
    />
  );
}

/**
 * Add source: a GitHub repository the person maintains, the registry its
 * toolchains publish under and the Slack channel of the team that approves
 * its updates. The toolchain-manager checks its GitHub App reaches the
 * repository with the person's grant; a source it adds waits for an owner's
 * approval unless the person is one.
 */
export function AddToolchainSourceDialog({
  installation,
  isOpen,
  onOpenChange,
}: AddToolchainSourceDialogProps) {
  const [repository, setRepository] = useState('');
  const [registry, setRegistry] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const add = useAddToolchainSource(installation);
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope, { isOpen });

  const errors = {
    repository: REPOSITORY_PATTERN.test(repository.trim())
      ? undefined
      : 'Enter the repository as owner/name, e.g. my-org/toolchains',
    registry: registry.trim()
      ? undefined
      : 'Enter the image repository prefix, e.g. registry.example.com/team/toolchains',
    slackChannel: /^#?[a-z0-9._-]+$/.test(slackChannel.trim())
      ? undefined
      : 'Enter the Slack channel, e.g. #team-toolchains',
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (errors.repository || errors.registry || errors.slackChannel) {
      validation.reveal();
      return;
    }
    add.mutate({
      repository: repositoryName(repository),
      registry: registry.trim(),
      slackChannel: slackChannel.trim(),
    });
  };

  const added = Boolean(add.data?.source);

  return (
    <BusyDialog
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) {
          // A closed dialog opens empty again: what was added is in the list.
          add.reset();
          setRepository('');
          setRegistry('');
          setSlackChannel('');
        }
        onOpenChange(open);
      }}
      isBusy={add.isPending}
      width="min(90vw, 560px)"
    >
      {close => (
        <form onSubmit={submit} style={DIALOG_FORM_STYLE}>
          <DialogHeader>Add toolchain source</DialogHeader>
          <DialogBody>
            <Flex direction="column" gap="3" ref={scope}>
              <Text variant="body-small" color="secondary">
                A repository whose CI checks and publishes toolchains, one
                directory per toolchain. The toolchain-manager’s GitHub App must
                be installed on it, and you must be able to push to it.
              </Text>
              <TextField
                label="Repository"
                isRequired
                placeholder="my-org/toolchains"
                value={repository}
                onChange={setRepository}
                isReadOnly={added}
                {...validation.textFieldProps('repository', errors.repository)}
              />
              <TextField
                label="Registry"
                isRequired
                description="The image repository prefix its toolchains publish under, <registry>/<name>."
                placeholder="registry.example.com/team/toolchains"
                value={registry}
                onChange={setRegistry}
                isReadOnly={added}
                {...validation.textFieldProps('registry', errors.registry)}
              />
              <TextField
                label="Slack channel"
                isRequired
                description="The channel of the team that approves the source’s updates."
                placeholder="#team-toolchains"
                value={slackChannel}
                onChange={setSlackChannel}
                isReadOnly={added}
                {...validation.textFieldProps(
                  'slackChannel',
                  errors.slackChannel,
                )}
              />
              {add.error && (
                <Alert
                  status="danger"
                  title="Could not add the source"
                  description={add.error.message}
                />
              )}
              {add.data && (
                <Outcome
                  installation={installation}
                  result={add.data}
                  // With the grant given, the same source is added again.
                  onConnected={() => add.variables && add.mutate(add.variables)}
                />
              )}
            </Flex>
          </DialogBody>
          <DialogFooter>
            {added ? (
              <Button variant="primary" onPress={close}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="secondary" onPress={close}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isDisabled={add.isPending}
                >
                  {add.isPending ? 'Adding…' : 'Add source'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      )}
    </BusyDialog>
  );
}

/** The Sources section's action, with its dialog. */
export function AddToolchainSourceButton({
  installation,
}: {
  installation: string;
}) {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="small"
        iconStart={<AddIcon />}
        onPress={() => setOpen(true)}
      >
        Add source
      </Button>
      <AddToolchainSourceDialog
        installation={installation}
        isOpen={isOpen}
        onOpenChange={setOpen}
      />
    </>
  );
}
