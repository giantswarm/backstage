import {
  PageBlueprint,
  createExtensionInput,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { FormFieldBlueprint } from '@backstage/plugin-scaffolder-react/alpha';
import scaffolderPlugin, {
  formFieldsApiRef,
} from '@backstage/plugin-scaffolder/alpha';

const scaffolderPageOverride = PageBlueprint.makeWithOverrides({
  inputs: {
    formFields: createExtensionInput([
      FormFieldBlueprint.dataRefs.formFieldLoader,
    ]),
  },
  factory(originalFactory, { apis, inputs }) {
    const formFieldsApi = apis.get(formFieldsApiRef);
    const formFieldLoaders = inputs.formFields.map(i =>
      i.get(FormFieldBlueprint.dataRefs.formFieldLoader),
    );
    return originalFactory({
      noHeader: true,
      routeRef: scaffolderPlugin.routes.root,
      path: '/create',
      loader: async () => {
        const { ScaffolderPage } = await import('@backstage/plugin-scaffolder');
        const { ScaffolderLayouts, createScaffolderLayout } =
          await import('@backstage/plugin-scaffolder-react');
        const { StepLayout } = await import('@giantswarm/backstage-plugin-gs');

        // Load form fields from both sources (matching upstream pattern):
        // 1. formFieldsApi collects fields wired to it (e.g. from other plugins)
        // 2. page inputs collects fields wired directly to the page
        const apiFormFields = (await formFieldsApi?.loadFormFields()) ?? [];
        const loadedFormFields = await Promise.all(
          formFieldLoaders.map(loader => loader()),
        );
        const formFields = [...apiFormFields, ...loadedFormFields];

        // createScaffolderLayout().expose() creates a data-attached component
        // that useCustomLayouts discovers via useElementFilter.
        // Runtime expose() takes no arguments despite the TypeScript declaration.
        const layout = createScaffolderLayout({
          name: 'GSStepLayout',
          component: StepLayout,
        });
        const GSStepLayoutHolder = (layout as any).expose() as React.FC;

        const headerOptions = {
          pageTitleOverride: 'Create things',
          title: 'Create things',
          subtitle: 'Create new things from templates',
        };

        // InternalRouter accepts formFields (resolved FormField[]) as an
        // internal prop not in the public type, so we cast to pass it through.
        const ScaffolderRouter =
          ScaffolderPage as unknown as React.ComponentType<{
            formFields?: unknown[];
            headerOptions?: Record<string, string>;
            templateFilter?: (entity: any) => boolean;
            children?: React.ReactNode;
          }>;

        return (
          <ScaffolderRouter
            formFields={formFields}
            headerOptions={headerOptions}
            templateFilter={entity =>
              !entity.metadata?.tags?.includes('hidden')
            }
          >
            <ScaffolderLayouts>
              <GSStepLayoutHolder />
            </ScaffolderLayouts>
          </ScaffolderRouter>
        );
      },
    });
  },
});

export const scaffolderPluginOverrides = createFrontendModule({
  pluginId: 'scaffolder',
  extensions: [scaffolderPageOverride],
});
