import type { ReactNode } from 'react';
import {
  Alert,
  Button,
  Flex,
  Radio,
  RadioGroup,
  Select,
  Text,
} from '@backstage/ui';
import {
  searchableIf,
  useGroupFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../../hooks/useAgentManager';
import { ORGANIZATIONS_CAPABILITY } from '../../../lib/organizations';
import {
  ACCESS_GRANT_HINT,
  OWNER_LABEL,
  ownerOf,
  TENANT_KIND_LABELS,
  tenantGroups,
  tenantKindOf,
  type TenantKind,
} from '../../../lib/tenants';
import { useNewAgentForm } from '../../NewAgentFormProvider';
import { LabelledField } from '../../LabelledField';
import { useOrganizationDirectory } from '../../OrganizationDirectoryProvider';

const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

/** The field where the choices are the person's organizations. */
const ORGANIZATION_LABEL = 'Organization';
const ORGANIZATION_DESCRIPTION =
  'Only the organizations you belong to. Its members use the agent, and its editors can change it.';

/**
 * Who can add a person to an organization, when agent-manager's answer does
 * not say it (`list_organizations`' `none`).
 */
const NO_ORGANIZATION_HINT =
  'An admin of an organization adds you, or someone with the agent-platform:organizations-admin role creates one with you as its first admin.';

/** What each kind means, after its label on the radio. */
const KIND_EXPLANATIONS: Record<TenantKind, string> = {
  platform: 'the platform’s agents, for everyone',
  organization: 'one organization’s agents, for its people',
  namespace: 'the agents of a namespace that is no organization',
};

/** Which of a field's problems shows now: `useFieldValidation`'s `errorFor`. */
export type TenantErrorFor = (
  field: 'tenant',
  problem: string | undefined,
) => string | undefined;

export type OwnerFieldOptions = {
  /**
   * Decides when the field's problem shows (the `forms` skill). None shows
   * without.
   */
  errorFor?: TenantErrorFor;
};

const quiet: TenantErrorFor = () => undefined;

export type OwnerField = {
  /**
   * Whether the field is a choice (or says why there is none), which puts it
   * and Environment in the main form; otherwise a line, or nothing.
   */
  inMain: boolean;
  /** The sole tenant's namespace, when the field is a line. */
  sole?: string;
  /** The field itself, for the page to put directly after Environment. */
  field: ReactNode;
};

/**
 * Who a new agent belongs to, its owner: the platform, an organization, or
 * another namespace on the picked environment in which the person may create
 * agents, as agent-manager answers it for them (`get_info`'s
 * `namespaces.managed`, checked per namespace with a
 * `SelfSubjectAccessReview`). Never a namespace typed by hand.
 *
 * Where several kinds are offered, the person chooses one in a radio group,
 * Platform first and preselected: the platform is no organization, so the
 * either/or stays in sight. Organization (or Other namespace) then offers its
 * namespaces by plain name in a dropdown below, one always picked
 * (`selectTenantKind`). A single kind with several namespaces is the dropdown
 * alone, its first picked. The only place is picked and stated in a line,
 * for the page to put under More options. Renders nothing until an
 * environment is picked and agent-manager has answered, or while editing,
 * where the agent stays where it is.
 *
 * A hook rather than a component for the reason `useEnvironmentField` is
 * one: the page mounts it once, and places its field with Environment's.
 */
export function useOwnerField({
  errorFor = quiet,
}: OwnerFieldOptions = {}): OwnerField {
  const { state, edit, fieldErrors, selectTenant, selectTenantKind } =
    useNewAgentForm();
  const installation = edit ? undefined : state.installation;
  // For Check again only: the form takes the answer itself
  // (`useTenantChoicesSync`, mounted by every step).
  const { info, canRead, refetch } = useAgentManagerInfo(installation);
  const { directory, organizationsOf, failureOf, recheck } =
    useOrganizationDirectory();
  // Where agent-manager serves the organization tools, the choices are the
  // organizations the person belongs to (`useTenantChoicesSync`), and the
  // field is named for them.
  const byOrganization =
    info?.capabilities?.[ORGANIZATIONS_CAPABILITY] === true;
  const mine =
    byOrganization && installation ? organizationsOf(installation) : undefined;
  const label = byOrganization ? ORGANIZATION_LABEL : OWNER_LABEL;
  const description = byOrganization ? ORGANIZATION_DESCRIPTION : DESCRIPTION;
  // The places as the form holds them, so the field never shows a pick the
  // form does not hold.
  const managed = state.tenantChoices;
  // `get_info` failed, or there is no muster plugin to ask, which the
  // Environment field explains (no Check again then: there is nothing to
  // read again).
  const failed = state.tenantChoicesUnread === 'failed';

  // A blocked Continue's problem: while there is nothing to pick from yet,
  // or where there is nothing the person may pick. Once there is, one is
  // always picked, so the choice itself has none.
  const blockError = useGroupFieldError(
    !managed || managed.length === 0
      ? errorFor('tenant', fieldErrors.tenant)
      : undefined,
  );
  // The group takes the focus itself where it holds no control (`forms`
  // skill: a blocked Continue focuses the first invalid field), and reads
  // its message to a screen reader then.
  const blockGroup = (children: ReactNode, focusable: boolean) => (
    <div
      aria-label={label}
      {...blockError.groupProps}
      // Only while it is in error and holds no control: the invalid field a
      // blocked Continue must focus has nothing else to take it, and
      // `focusFirstInvalidField` takes no `tabIndex` -1.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={focusable && blockError.message ? 0 : undefined}
    >
      {children}
    </div>
  );

  if (!installation) {
    return { inMain: false, field: null };
  }
  if (!managed) {
    // Still reading, or agent-manager did not answer (or answered without
    // a list, where no owner is asked for). Nothing, rather than a line that
    // would vanish a moment later in the common single-place case, until a
    // blocked Continue asks for the owner: then the field says why there is
    // none yet, and offers to read it again where it failed.
    if (!blockError.message) {
      return { inMain: false, field: null };
    }
    const offersRetry = failed && canRead;
    return {
      inMain: true,
      field: (
        <LabelledField label={label} description={description}>
          {blockGroup(
            <>
              {blockError.message}
              {offersRetry && (
                <Button
                  size="small"
                  variant="secondary"
                  onPress={() =>
                    // The read that failed: the organizations the person
                    // belongs to, or `get_info` itself.
                    byOrganization && installation && failureOf(installation)
                      ? recheck(installation)
                      : refetch()
                  }
                >
                  Check again
                </Button>
              )}
            </>,
            !offersRetry,
          )}
        </LabelledField>
      ),
    };
  }

  if (managed.length === 0) {
    return {
      inMain: true,
      field: (
        <LabelledField label={label} description={description}>
          {blockGroup(
            <Flex direction="column" gap="2">
              {byOrganization ? (
                <Alert
                  status="warning"
                  title={`You belong to no organization on ${installation}`}
                  description={capitalize(mine?.none ?? NO_ORGANIZATION_HINT)}
                />
              ) : (
                <Alert
                  status="warning"
                  title="You may not create agents here"
                  description={`On ${installation}, you may create agents neither for the platform nor for an organization. ${ACCESS_GRANT_HINT}`}
                />
              )}
              {blockError.message}
            </Flex>,
            true,
          )}
        </LabelledField>
      ),
    };
  }

  if (managed.length === 1) {
    // Nothing to choose: a line says who owns it.
    return {
      inMain: false,
      sole: managed[0],
      field: (
        <Text as="p" variant="body-small" color="secondary">
          {label}: <strong>{ownerOf(managed[0], directory)}</strong>,{' '}
          {byOrganization
            ? `the only organization you belong to on ${installation}.`
            : `the only one you may create agents for on ${installation}.`}
        </Text>
      ),
    };
  }

  const { kinds, byKind } = tenantGroups(managed, directory);
  const offersKind = kinds.length > 1;
  // One is always picked once there are choices (`setTenantChoices`).
  const pickedKind = state.tenant
    ? tenantKindOf(state.tenant, directory)
    : kinds[0];
  // The kind whose dropdown shows: the one chosen, or the only one.
  const dropdownKind = offersKind ? pickedKind : kinds[0];
  const dropdownChoices = byKind[dropdownKind];

  const dropdown =
    dropdownKind === 'platform' ? null : (
      <Select
        // Labelled by the radio it belongs to, or as the field where it is
        // the field.
        {...(offersKind
          ? { 'aria-label': TENANT_KIND_LABELS[dropdownKind] }
          : { label, description })}
        isRequired
        searchable={searchableIf(dropdownChoices)}
        options={dropdownChoices.map(namespace => ({
          id: namespace,
          // Under Other namespace, the namespace's own name.
          label:
            dropdownKind === 'namespace'
              ? namespace
              : ownerOf(namespace, directory),
        }))}
        selectedKey={
          state.tenant && dropdownChoices.includes(state.tenant)
            ? state.tenant
            : null
        }
        onSelectionChange={key => {
          if (key) {
            selectTenant(String(key));
          }
        }}
      />
    );

  if (!offersKind) {
    return { inMain: true, field: dropdown };
  }

  return {
    inMain: true,
    field: (
      <Flex direction="column" gap="2">
        <RadioGroup
          label={label}
          description={description}
          isRequired
          value={pickedKind}
          onChange={value => selectTenantKind(value as TenantKind)}
        >
          {kinds.map(kind => (
            <Radio key={kind} value={kind}>
              {TENANT_KIND_LABELS[kind]} — {KIND_EXPLANATIONS[kind]}
            </Radio>
          ))}
        </RadioGroup>
        {dropdown}
      </Flex>
    ),
  };
}

/** `text` with its first letter capitalized, as a sentence starts. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
