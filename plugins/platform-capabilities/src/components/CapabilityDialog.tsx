import { FormEvent, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CapabilityPlan,
  CapabilityState,
  Committed,
  Definition,
  Installation,
  platformCapabilitiesApiRef,
  WriteOptions,
  WriteResult,
} from '../apis';
import {
  formOf,
  initialValues,
  missingRequired,
  Values,
} from '../lib/schemaForm';
import { ActionView } from './ActionView';
import { ErrorAlert } from './ErrorAlert';
import { OptInNote, PlanView } from './PlanView';
import { QUERY_ROOT, useConnection } from './queries';
import { SchemaForm } from './SchemaForm';

/** The manager's answer to a write it does not accept, shown as its own. */
export const REFUSED_TITLE = 'giantswarm-platform-manager refused';

const FORM_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  flex: 1,
  minHeight: 0,
};

export interface CapabilityDialogProps {
  kind: 'enable' | 'reconcile';
  installation: Installation;
  capability: CapabilityState;
  /** The capability's definition from `get_info`; its schema is the form. */
  definition?: Definition;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Enable or Reconcile of one capability on one installation: the inputs as
 * the form the definition's schema describes, prefilled from the record; the
 * manager's dry run of the change; the commit as the signed-in person; the
 * Action it started. Commit is disabled without the manager's grant (the
 * connect through muster) and absent where the manager says a commit would
 * be refused -- an installation not opted in shows the file's path and the
 * pull request that adds it instead. Decisions live on this form; every
 * step's result is shown underneath.
 */
export function CapabilityDialog({
  kind,
  installation,
  capability,
  definition,
  isOpen,
  onClose,
}: CapabilityDialogProps) {
  const api = useApi(platformCapabilitiesApiRef);
  const queryClient = useQueryClient();
  const connection = useConnection();
  const schema = definition?.inputSchema;
  const form = useMemo(() => formOf(schema ?? {}), [schema]);
  const [values, setValues] = useState<Values>(() =>
    initialValues(form, schema ?? {}, {
      installation: capability.inputs?.installation ?? installation.record,
    }),
  );
  const [plan, setPlan] = useState<CapabilityPlan>();
  const [done, setDone] = useState<Committed>();

  const write = <O extends WriteOptions>(
    options: O,
  ): Promise<WriteResult<O>> =>
    kind === 'enable'
      ? api.enableCapability(
          installation.name,
          capability.name,
          { inputs: values },
          options,
        )
      : api.reconcileCapability(
          installation.name,
          capability.name,
          { inputs: values },
          options,
        );

  const review = useMutation({
    mutationFn: () => write({ dryRun: true }),
    onSuccess: setPlan,
  });
  const commit = useMutation({
    mutationFn: () => write({ mode: 'commit' }),
    onSuccess: async result => {
      setDone(result);
      await queryClient.invalidateQueries({ queryKey: [QUERY_ROOT] });
    },
  });

  const busy = review.isPending || commit.isPending;
  const failure = (commit.error ?? review.error) as Error | null;
  const missing = missingRequired(form, values);
  const planned = plan?.installations.find(i => i.name === installation.name);
  const commitRefused = planned?.commitRefused ?? planned?.refused;
  const connected = connection.data?.connected === true;
  const title = `${kind === 'enable' ? 'Enable' : 'Reconcile'} ${capability.name} on ${installation.name}`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (!plan) {
      review.mutate();
    } else if (connected && !commitRefused) {
      commit.mutate();
    }
  };

  const back = () => {
    setPlan(undefined);
    review.reset();
    commit.reset();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => !open && !busy && onClose()}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      width="min(90vw, 900px)"
    >
      <form onSubmit={onSubmit} style={FORM_STYLE} aria-label={title}>
        <DialogHeader>{title}</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              {definition?.description ??
                'The manager renders the change from these inputs; Review shows the files, pull requests, secrets by name, Dex clients, customer actions and probes before anything is committed.'}
            </Text>
            {installation.optIn.state === 'not opted in' && (
              <OptInNote optIn={installation.optIn} />
            )}
            {!plan && !done && (
              <>
                <SchemaForm form={form} values={values} onChange={setValues} />
                {missing.length > 0 && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    data-testid="missing-required"
                  >
                    Required, not chosen yet: {missing.join(', ')}. The manager
                    refuses a review without them.
                  </Text>
                )}
              </>
            )}
            {plan && !done && <PlanView plan={plan} />}
            {plan && !done && !connected && !commitRefused && (
              <Alert
                status="warning"
                title="Commit needs your grant"
                description={
                  connection.data?.message ??
                  'Your muster session does not reach the platform manager yet; connect first.'
                }
              />
            )}
            {done && (
              <Flex direction="column" gap="2" data-testid="committed">
                <Text variant="body-medium">
                  {done.message ?? 'Action started.'}
                </Text>
                {done.action && <ActionView action={done.action} />}
              </Flex>
            )}
            {failure && <ErrorAlert title={REFUSED_TITLE} error={failure} />}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Flex gap="2" justify="end">
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!done && !plan && (
              <Button type="submit" variant="primary" isDisabled={busy}>
                {review.isPending ? 'Rendering…' : 'Review'}
              </Button>
            )}
            {!done && plan && (
              <Button variant="secondary" onPress={back} isDisabled={busy}>
                Back
              </Button>
            )}
            {!done && plan && !commitRefused && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={busy || !connected}
              >
                {commit.isPending ? 'Committing…' : 'Commit'}
              </Button>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
