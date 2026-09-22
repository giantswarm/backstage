import { FormEvent, useMemo, useRef, useState } from 'react';
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
import { reasonOf, refusalStatus } from '../lib/refusal';
import {
  Field,
  fieldsNamed,
  fieldsOf,
  formOf,
  initialValues,
  missingRequired,
  personForm,
  Values,
} from '../lib/schemaForm';
import { ActionView } from './ActionView';
import { ComparisonView } from './ComparisonView';
import { ErrorAlert } from './ErrorAlert';
import { PlanView } from './PlanView';
import { QUERY_ROOT, useConnection } from './queries';
import { labelsOf, SchemaForm } from './SchemaForm';

/** The manager's answer to a write it does not accept, shown as its own. */
export const REFUSED_TITLE = 'giantswarm-platform-manager refused';

/** What a field the manager's refusal names says under itself. */
export const REFUSED_MESSAGE = "The manager's refusal names this choice.";

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
  /** The card's comparison; its inputs are what the form opens with. */
  comparison?: VerifyResult;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Enable, or Apply changes to, one capability on one installation in two
 * steps. Review: the choices the definition leaves to a person as the form
 * its schema describes, opening with the comparison's inputs -- every choice
 * on record or read back from the files, no schema default -- then the
 * comparison computed with them: the features with their marks and the
 * plan's files, pull requests, generated secrets, Dex clients and customer
 * actions. The required choices without a value are marked on their fields
 * and named next to the button, each name leading to its field. Where the
 * manager refuses -- the definition's refusal of the inputs, or why it would
 * refuse the commit -- the review shows the reason as an Alert, `info` for
 * an input the dialog supplies and `warning` for something fixed first, over
 * the form kept editable: the fields the reason names are marked and led to
 * from the Alert, and Review runs the comparison again. Open pull requests:
 * the commit as the signed-in person and the Action it started. The commit
 * is disabled without the person's session at the manager.
 */
export function CapabilityDialog({
  kind,
  installation,
  capability,
  definition,
  comparison,
  isOpen,
  onClose,
}: CapabilityDialogProps) {
  const api = useApi(platformCapabilitiesApiRef);
  const queryClient = useQueryClient();
  const connection = useConnection();
  const formRef = useRef<HTMLFormElement>(null);
  const schema = definition?.inputSchema;
  const whole = useMemo(() => formOf(schema ?? {}), [schema]);
  const fields = useMemo(() => fieldsOf(whole), [whole]);
  const form = useMemo(() => personForm(whole), [whole]);
  const labels = useMemo(() => labelsOf(form), [form]);
  const [values, setValues] = useState<Values>(() =>
    initialValues(form, comparison?.inputs?.values),
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
  // The definition's reason over the commit's copy of it.
  const reason = reasonOf(reviewed);
  const refusal =
    reviewed && reason ? refusalStatus(reviewed, fields) : undefined;
  // The form's fields the reason names: marked on the form, led to from the Alert.
  const named = useMemo(
    () => (reason ? fieldsNamed(reason, fieldsOf(form)) : []),
    [reason, form],
  );
  const errors = useMemo(
    () => new Map(named.map(field => [field.name, REFUSED_MESSAGE])),
    [named],
  );
  // The form stays while the manager refuses: what the reason names is
  // changed there and reviewed again.
  const editing = !done && (!reviewed || Boolean(reason));
  const accepted = reviewed && !reason && !done ? reviewed : undefined;
  const nothingToOpen =
    accepted !== undefined && (accepted.pullRequests ?? []).length === 0;
  const connected = connection.data?.connected === true;
  const title = `${kind === 'enable' ? 'Enable' : 'Apply changes to'} ${capability.name} on ${installation.name}`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (editing) {
      review.mutate();
    } else if (accepted && connected && !nothingToOpen) {
      commit.mutate();
    }
  };

  const back = () => {
    setReviewed(undefined);
    review.reset();
    commit.reset();
  };

  /** Brings the field into view and gives it the focus. */
  const goTo = (field: Field) => {
    const control = formRef.current
      ?.querySelector(`[data-field="${field.name}"]`)
      ?.querySelector<HTMLElement>('input:not([type="hidden"]), button');
    control?.scrollIntoView?.({ block: 'center' });
    control?.focus();
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
        ref={formRef}
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
            {reason && refusal && !done && (
              <Alert
                status={refusal}
                icon
                title="The manager would refuse this"
                description={reason}
                customActions={
                  named.length > 0
                    ? named.map(field => (
                        <Button
                          key={field.name}
                          variant="tertiary"
                          size="small"
                          onPress={() => goTo(field)}
                        >
                          {labels.get(field.name)}
                        </Button>
                      ))
                    : undefined
                }
                data-testid="refused"
              />
            )}
            {editing && (
              <SchemaForm
                form={form}
                values={values}
                onChange={setValues}
                errors={errors}
              />
            )}
            {accepted && (
              <>
                <ComparisonView result={accepted} />
                <PlanView plan={accepted} />
                {!connected && (
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
          <Flex gap="4" justify="between" align="center">
            {editing && missing.length > 0 ? (
              <Flex
                gap="1"
                align="center"
                style={{ flexWrap: 'wrap' }}
                data-testid="missing-required"
              >
                <Text variant="body-small" color="secondary">
                  Required, not chosen yet:
                </Text>
                {missing.map(field => (
                  <Button
                    key={field.name}
                    variant="tertiary"
                    size="small"
                    onPress={() => goTo(field)}
                  >
                    {labels.get(field.name)}
                  </Button>
                ))}
              </Flex>
            ) : (
              <span />
            )}
            <Flex gap="2" justify="end">
              <Button variant="secondary" onPress={onClose} isDisabled={busy}>
                {done ? 'Close' : 'Cancel'}
              </Button>
              {editing && (
                <Button type="submit" variant="primary" isDisabled={busy}>
                  {review.isPending ? 'Comparing…' : 'Review'}
                </Button>
              )}
              {accepted && (
                <Button variant="secondary" onPress={back} isDisabled={busy}>
                  Back
                </Button>
              )}
              {accepted && !nothingToOpen && (
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={busy || !connected}
                >
                  {commit.isPending ? 'Opening…' : 'Open pull requests'}
                </Button>
              )}
            </Flex>
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
