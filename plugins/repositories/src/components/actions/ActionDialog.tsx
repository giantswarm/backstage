import { FormEvent, ReactNode, useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { useMutation } from '@tanstack/react-query';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';

/** The manager's answer to a write it does not accept, shown as its own. */
export const REFUSED_TITLE = 'giantswarm-repo-manager refused';

const FORM_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  flex: 1,
  minHeight: 0,
};

export interface ActionDialogProps<TPlan, TDone> {
  title: string;
  /** What the action does and who reviews it, in the tool's own words. */
  intro: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  /** The form; hidden once the plan shows. */
  fields: ReactNode;
  /** The form holds what the tool needs. */
  ready: boolean;
  /** The dry run (`dryRun: true`); an action without one commits directly. */
  dryRun?: () => Promise<TPlan>;
  renderPlan?: (plan: TPlan) => ReactNode;
  /** The write (`mode: commit`). */
  commit: () => Promise<TDone>;
  renderDone: (done: TDone) => ReactNode;
  commitLabel: string;
  onDone?: (done: TDone) => void;
}

/**
 * One action of the Repositories page: the form, the manager's dry run of
 * the change, the commit as the signed-in person, the outcome. A write the
 * manager refuses shows its reason under the form, which stays as it was;
 * there is no other button -- the manager's decision is not overridable from
 * here.
 */
export function ActionDialog<TPlan, TDone>({
  title,
  intro,
  isOpen,
  onClose,
  fields,
  ready,
  dryRun,
  renderPlan,
  commit,
  renderDone,
  commitLabel,
  onDone,
}: ActionDialogProps<TPlan, TDone>) {
  const [plan, setPlan] = useState<TPlan>();
  const [done, setDone] = useState<TDone>();

  const review = useMutation({
    mutationFn: async () => {
      if (!dryRun) {
        throw new Error('no dry run');
      }
      return dryRun();
    },
    onSuccess: setPlan,
  });
  const write = useMutation({
    mutationFn: commit,
    onSuccess: result => {
      setDone(result);
      onDone?.(result);
    },
  });
  const busy = review.isPending || write.isPending;
  const failure = (write.error ?? review.error) as Error | null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    if (dryRun && !plan) {
      review.mutate();
    } else {
      write.mutate();
    }
  };

  const back = () => {
    setPlan(undefined);
    review.reset();
    write.reset();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={open => !open && !busy && onClose()}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      width="min(90vw, 860px)"
    >
      <form onSubmit={onSubmit} style={FORM_STYLE} aria-label={title}>
        <DialogHeader>{title}</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              {intro}
            </Text>
            {!plan && !done && (
              <Flex direction="column" gap="3">
                {fields}
              </Flex>
            )}
            {plan && !done && renderPlan?.(plan)}
            {done && renderDone(done)}
            {failure && (
              <RepositoriesErrorAlert title={REFUSED_TITLE} error={failure} />
            )}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Flex gap="2" justify="end">
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!done && dryRun && !plan && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={!ready || busy}
              >
                {review.isPending ? 'Rendering…' : 'Review'}
              </Button>
            )}
            {!done && dryRun && plan && (
              <Button variant="secondary" onPress={back} isDisabled={busy}>
                Back
              </Button>
            )}
            {!done && (!dryRun || plan) && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={!ready || busy}
              >
                {write.isPending ? 'Working…' : commitLabel}
              </Button>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
