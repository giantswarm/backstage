import { type ReactNode, useEffect } from 'react';
import {
  Alert,
  Button,
  Flex,
  type Option,
  type OptionSection,
  Select,
  Text,
} from '@backstage/ui';
import {
  searchableIf,
  useGroupFieldError,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  ACCESS_GRANT_HINT,
  defaultTenant,
  TENANT_KIND_LABELS,
  tenantGroups,
  tenantKindOf,
  tenantOf,
} from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { LabelledField } from './LabelledField';

const TITLE = 'Organization';

const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

/** Which of a field's problems shows now: `useFieldValidation`'s `errorFor`. */
export type TenantErrorFor = (
  field: 'tenant',
  problem: string | undefined,
) => string | undefined;

export type OrganizationFieldOptions = {
  /**
   * Decides when the field's problem shows (the `forms` skill). Asked only
   * while the dropdown is on screen, so one that appears after a blocked
   * Continue stays quiet until the next. None shows without.
   */
  errorFor?: TenantErrorFor;
};

const quiet: TenantErrorFor = () => undefined;

export type OrganizationField = {
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

/** The sole tenant as a value of the form: "Platform", or its name. */
export function soleOrganizationLabel(namespace: string): string {
  return tenantKindOf(namespace) === 'platform'
    ? TENANT_KIND_LABELS.platform
    : tenantOf(namespace);
}

/** The sections of the dropdown, after Platform, where several kinds are offered. */
const SECTION_TITLES = {
  organization: 'Organizations',
  namespace: 'Other namespaces',
} as const;

/**
 * Where a new agent is created: the platform, an organization, or another
 * namespace on the picked environment in which the person may create agents,
 * as agent-manager answers it for them (`get_info`'s `namespaces.managed`,
 * checked per namespace with a `SelfSubjectAccessReview`). Never a namespace
 * typed by hand. Several are one dropdown: Platform first, then the
 * organizations by plain name and the other namespaces by their name, each
 * kind its own section where there are several kinds, the first preselected
 * (`setTenantChoices`). The only one is picked and stated in a line. Renders nothing until an
 * environment is picked and agent-manager has answered, or while editing,
 * where the agent stays where it is.
 *
 * A hook rather than a component for the reason `useEnvironmentField` is
 * one: the page mounts it once, and places its field with Environment's.
 */
export function useOrganizationField({
  errorFor = quiet,
}: OrganizationFieldOptions = {}): OrganizationField {
  const {
    state,
    edit,
    fieldErrors,
    setTenantChoices,
    setTenantChoicesFailed,
    selectTenant,
  } = useNewAgentForm();
  const installation = edit ? undefined : state.installation;
  const { info, isLoading, refetch } = useAgentManagerInfo(installation);
  const managed = info?.namespaces?.managed;
  const choicesKey = managed?.join(',');
  // agent-manager answered without the places, failed, or cannot be reached.
  const failed = Boolean(installation) && !isLoading && !managed;

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);
  useEffect(() => {
    setTenantChoicesFailed(failed);
  }, [failed, setTenantChoicesFailed]);

  const showsDropdown = Boolean(installation && managed && managed.length > 1);
  const shownProblem = errorFor('tenant', fieldErrors.tenant);
  const pickError = useSelectFieldError(
    showsDropdown ? shownProblem : undefined,
  );
  // A blocked Continue's problem while there is no dropdown to carry it.
  const unreadError = useGroupFieldError(!managed ? shownProblem : undefined);

  if (!installation) {
    return { inMain: false, field: null };
  }
  if (!managed) {
    // Still reading, or agent-manager did not answer. Nothing, rather than a
    // line that would vanish a moment later in the common single-place case,
    // until a blocked Continue asks for the place: then the field says why
    // there is none yet, and offers to read it again where it failed.
    if (!unreadError.message) {
      return { inMain: false, field: null };
    }
    return {
      inMain: true,
      field: (
        <LabelledField label={TITLE} description={DESCRIPTION}>
          <div aria-label={TITLE} {...unreadError.groupProps}>
            {unreadError.message}
            {failed && (
              <Button size="small" variant="secondary" onPress={refetch}>
                Check again
              </Button>
            )}
          </div>
        </LabelledField>
      ),
    };
  }

  if (managed.length === 0) {
    return {
      inMain: true,
      field: (
        <LabelledField label={TITLE} description={DESCRIPTION}>
          <Alert
            status="warning"
            title="You may not create agents here"
            description={`On ${installation}, you may create agents neither for the platform nor for an organization. ${ACCESS_GRANT_HINT}`}
          />
        </LabelledField>
      ),
    };
  }

  if (managed.length === 1) {
    // Nothing to choose: a line says where it belongs.
    return {
      inMain: false,
      sole: managed[0],
      field: (
        <Text as="p" variant="body-small" color="secondary">
          Belongs to <strong>{soleOrganizationLabel(managed[0])}</strong>, the
          only place on {installation} where you may create agents.
        </Text>
      ),
    };
  }

  const { kinds, byKind } = tenantGroups(managed);
  const optionsOf = (namespaces: string[]): Option[] =>
    namespaces.map(namespace => ({
      id: namespace,
      // Another namespace by its own name, an organization by its plain one.
      label:
        tenantKindOf(namespace) === 'namespace'
          ? namespace
          : tenantOf(namespace),
    }));
  const platform = byKind.platform.map(namespace => ({
    id: namespace,
    label: TENANT_KIND_LABELS.platform,
    description: 'Available to all organizations.',
  }));
  const sectioned = kinds.filter(kind => kind !== 'platform').length > 1;
  const options: (Option | OptionSection)[] = [
    ...platform,
    ...(['organization', 'namespace'] as const).flatMap(
      (kind): (Option | OptionSection)[] => {
        if (byKind[kind].length === 0) {
          return [];
        }
        return sectioned
          ? [{ title: SECTION_TITLES[kind], options: optionsOf(byKind[kind]) }]
          : optionsOf(byKind[kind]);
      },
    ),
  ];

  return {
    inMain: true,
    field: (
      <Flex direction="column" gap="2">
        <Select
          label={TITLE}
          description={DESCRIPTION}
          isRequired
          searchable={searchableIf(managed)}
          options={options}
          // The provider picks one as soon as the choices are in; until that
          // lands, the one it picks shows rather than a placeholder.
          selectedKey={
            state.tenant && managed.includes(state.tenant)
              ? state.tenant
              : (defaultTenant(managed) ?? null)
          }
          onSelectionChange={key => {
            if (key) {
              selectTenant(String(key));
            }
          }}
          {...pickError.selectProps}
        />
        {pickError.message}
      </Flex>
    ),
  };
}
