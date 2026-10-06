import { useCallback, type ComponentType } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { SubPageBlueprint } from '@backstage/frontend-plugin-api';
import scaffolderPlugin, {
  formFieldsApiRef,
} from '@backstage/plugin-scaffolder/alpha';
import { scaffolderTranslationRef } from '@backstage/plugin-scaffolder';
import {
  type FieldExtensionOptions,
  type LayoutOptions,
  type ReviewStepProps,
  SecretsContextProvider,
} from '@backstage/plugin-scaffolder-react';
import {
  TemplateCategoryPicker,
  TemplateGroups,
} from '@backstage/plugin-scaffolder-react/alpha';
import {
  Content,
  ContentHeader,
  DocsIcon,
  SupportButton,
} from '@backstage/core-components';
import { useApp, useRouteRef } from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import {
  CatalogFilterLayout,
  EntityKindPicker,
  EntityListProvider,
  EntityOwnerPicker,
  EntitySearchBar,
  EntityTagPicker,
  UserListPicker,
} from '@backstage/plugin-catalog-react';
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { buildTechDocsURL } from '@backstage/plugin-techdocs-react';
import type { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { GSTemplateWizardPageContent } from './GSTemplateWizardPageContent';

const TECHDOCS_ANNOTATION = 'backstage.io/techdocs-ref';
const TECHDOCS_EXTERNAL_ANNOTATION = 'backstage.io/techdocs-entity';

function GSTemplateListContent(props: {
  templateFilter?: (entity: TemplateEntityV1beta3) => boolean;
}) {
  const viewTechDocsLink = useRouteRef(
    scaffolderPlugin.externalRoutes.viewTechDoc,
  );
  const templateRoute = useRouteRef(scaffolderPlugin.routes.selectedTemplate);
  const navigate = useNavigate();
  const app = useApp();
  const { t } = useTranslationRef(scaffolderTranslationRef);

  const groups = [
    {
      title: t('templateListPage.templateGroups.defaultTitle'),
      filter: props.templateFilter ?? (() => true),
    },
  ];

  const additionalLinksForEntity = useCallback(
    (template: TemplateEntityV1beta3) => {
      if (
        !(
          template.metadata.annotations?.[TECHDOCS_ANNOTATION] ||
          template.metadata.annotations?.[TECHDOCS_EXTERNAL_ANNOTATION]
        ) ||
        !viewTechDocsLink
      ) {
        return [];
      }
      const url = buildTechDocsURL(template, viewTechDocsLink);
      return url
        ? [
            {
              icon: app.getSystemIcon('docs') ?? DocsIcon,
              text: t(
                'templateListPage.additionalLinksForEntity.viewTechDocsTitle',
              ),
              url,
            },
          ]
        : [];
    },
    [app, viewTechDocsLink, t],
  );

  const onTemplateSelected = useCallback(
    (template: TemplateEntityV1beta3) => {
      const { namespace, name } = parseEntityRef(stringifyEntityRef(template));
      navigate(templateRoute({ namespace, templateName: name }));
    },
    [navigate, templateRoute],
  );

  return (
    <EntityListProvider>
      <Content>
        <ContentHeader>
          <SupportButton>
            {t('templateListPage.contentHeader.supportButtonTitle')}
          </SupportButton>
        </ContentHeader>
        <CatalogFilterLayout>
          <CatalogFilterLayout.Filters>
            <EntitySearchBar />
            <EntityKindPicker initialFilter="template" hidden />
            <UserListPicker
              initialFilter="all"
              availableFilters={['all', 'starred']}
            />
            <TemplateCategoryPicker />
            <EntityTagPicker />
            <EntityOwnerPicker />
          </CatalogFilterLayout.Filters>
          <CatalogFilterLayout.Content>
            <TemplateGroups
              groups={groups}
              onTemplateSelected={onTemplateSelected}
              additionalLinksForEntity={additionalLinksForEntity}
            />
          </CatalogFilterLayout.Content>
        </CatalogFilterLayout>
      </Content>
    </EntityListProvider>
  );
}

function GSTemplatesSubPage(props: {
  fieldExtensions: FieldExtensionOptions<any, any>[];
  layouts: LayoutOptions[];
  ReviewStepComponent?: ComponentType<ReviewStepProps>;
  templateFilter?: (entity: TemplateEntityV1beta3) => boolean;
}) {
  return (
    <Routes>
      <Route
        index
        element={
          <GSTemplateListContent templateFilter={props.templateFilter} />
        }
      />
      <Route
        path=":namespace/:templateName"
        element={
          <SecretsContextProvider>
            <GSTemplateWizardPageContent
              extensions={props.fieldExtensions}
              layouts={props.layouts}
              components={
                props.ReviewStepComponent
                  ? { ReviewStepComponent: props.ReviewStepComponent }
                  : undefined
              }
            />
          </SecretsContextProvider>
        }
      />
    </Routes>
  );
}

export const ScaffolderTemplatesSubPageOverride =
  SubPageBlueprint.makeWithOverrides({
    name: 'templates',
    factory(originalFactory, { apis }) {
      const formFieldsApi = apis.get(formFieldsApiRef);
      return originalFactory({
        path: 'templates',
        title: 'Templates',
        loader: async () => {
          // formFieldsApi.loadFormFields() returns FormField[] which at runtime
          // are FieldExtensionOptions with additional $$type/version branding.
          // The Stepper/Workflow components only read the FieldExtensionOptions
          // properties (name, component, validation, schema), so a cast is safe.
          const formFields = (await formFieldsApi?.loadFormFields()) ?? [];
          const fieldExtensions =
            formFields as unknown as FieldExtensionOptions<any, any>[];

          const { StepLayout, ReviewStep } =
            await import('@giantswarm/backstage-plugin-gs');

          const layouts: LayoutOptions[] = [
            { name: 'GSStepLayout', component: StepLayout },
          ];

          return (
            <GSTemplatesSubPage
              fieldExtensions={fieldExtensions}
              layouts={layouts}
              ReviewStepComponent={ReviewStep}
              templateFilter={entity =>
                !entity.metadata?.tags?.includes('hidden')
              }
            />
          );
        },
      });
    },
  });
