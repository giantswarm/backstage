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
  CapabilityState,
  Committed,
  Definition,
  Installation,
  platformCapabilitiesApiRef,
  VerifyResult,
} from '../apis';
import {
  formOf,
  initialValues,
  missingRequired,
  Values,
} from '../lib/schemaForm';
import { ActionView } from './ActionView';
import { ComparisonView } from './ComparisonView';
import { ErrorAlert } from './ErrorAlert';
import { PlanView } from './PlanView';
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
  /** `enable` installs the capability; `reconcile` applies changes to an installed one. */
  kind: 'enable' | 'reconcile';
  installation: Installation;
  capability: CapabilityState;
  /** The capability's definition from `get_info`; its schema is the form. */
  definition?: Definition;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Enable, or Apply changes to, one capability on one installation in two
 * steps. Review: the inputs as the form the definition's schema describes,
 * prefilled from the record, then the comparison computed with them -- the
 * features with their marks and the plan's files, pull requests, generated
 * secrets, Dex clients and customer actions. Open pull requests: the commit
 * as the signed-in person and the Action it started. The commit is disabled
 * without the person's session at the manager and absent where the manager
 * says it would refuse one, in which case the refusal is all the review
 * shows.
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
  const [reviewed, setReviewed] = useState<VerifyResult>();
  const [done, setDone] = useState<Committed>();

  const review = useMutation({
    mutationFn: () =>
      api.verifyCapability(installation.name, capability.name, {
        inputs: values,
        content: true,
      }),
    onSuccess: setReviewed,
  });
  const commit = useMutation({
    mutationFn: () =>
      kind === 'enable'
        ? api.enableCapability(
            installation.name,
            capability.name,
            { inputs: values },
            { mode: 'commit' },
          )
        : api.reconcileCapability(
            installation.name,
            capability.name,
            { inputs: values },
            { mode: 'commit' },
          ),
    onSuccess: async result => {
      setDone(result);
      await queryClient.invalidateQueries({ queryKey: [QUERY_ROOT] });
    },
  });

  const busy = review.isPending || commit.isPending;
  const failure = (commit.error ?? review.error) as Error | null;
  const missing = missingRequired(form, values);
  const refused = reviewed?.commitRefused ?? reviewed?.refused;
  const nothingToOpen =
    reviewed && !refused && (reviewed.pullRequests ?? []).length === 0;
  const connected = connection.data?.connected === true;
  const title = `${kind === 'enable' ? 'Enable' : 'Apply changes to'} ${capability.name} on ${installation.name}`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (!reviewed) {
      review.mutate();
    } else if (connected && !refused && !nothingToOpen) {
      commit.mutate();
    }
  };

  const back = () => {
    setReviewed(undefined);
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
      <form
        noValidate
        onSubmit={onSubmit}
        style={FORM_STYLE}
        aria-label={title}
      >
        <DialogHeader>{title}</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              Nothing is written before Open pull requests.
            </Text>
            {!reviewed && !done && (
              <>
                <SchemaForm form={form} values={values} onChange={setValues} />
                {missing.length > 0 && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    data-testid="missing-required"
                  >
                    Required, not chosen yet: {missing.join(', ')}.
                  </Text>
                )}
              </>
            )}
            {reviewed && !done && (
              <>
                {refused && (
                  <div data-testid="refused">
                    <Alert
                      status="warning"
                      title="The manager would refuse this"
                      description={refused}
                    />
                  </div>
                )}
                {!refused && (
                  <>
                    <ComparisonView result={reviewed} />
                    <PlanView plan={reviewed} />
                  </>
                )}
                {!connected && !refused && (
                  <Alert
                    status="warning"
                    title="Needs your session"
                    description={
                      connection.data?.message ??
                      'Connect to the platform manager first.'
                    }
                  />
                )}
              </>
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
            {!done && !reviewed && (
              <Button type="submit" variant="primary" isDisabled={busy}>
                {review.isPending ? 'Comparing…' : 'Review'}
              </Button>
            )}
            {!done && reviewed && (
              <Button variant="secondary" onPress={back} isDisabled={busy}>
                Back
              </Button>
            )}
            {!done && reviewed && !refused && !nothingToOpen && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={busy || !connected}
              >
                {commit.isPending ? 'Opening…' : 'Open pull requests'}
              </Button>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
