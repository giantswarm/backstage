import { createPlugin } from '@backstage/core-plugin-api';
import {
  createScaffolderFieldExtension,
  createScaffolderLayout,
} from '@backstage/plugin-scaffolder-react';

import {
  ChartPicker,
  ChartPickerSchema,
} from './components/scaffolder/ChartPicker';
import {
  ChartTagPicker,
  ChartTagPickerSchema,
} from './components/scaffolder/ChartTagPicker';
import {
  ClusterPicker,
  ClusterPickerSchema,
  clusterPickerValidation,
} from './components/scaffolder/ClusterPicker';
import {
  ProviderConfigPicker,
  ProviderConfigPickerSchema,
} from './components/scaffolder/ProviderConfigPicker';
import { OIDCToken, OIDCTokenSchema } from './components/scaffolder/OIDCToken';
import {
  InstallationPicker,
  InstallationPickerSchema,
  installationPickerValidation,
} from './components/scaffolder/InstallationPicker';
import {
  ReleasePicker,
  ReleasePickerSchema,
} from './components/scaffolder/ReleasePicker';
import {
  OrganizationPicker,
  OrganizationPickerSchema,
} from './components/scaffolder/OrganizationPicker';
import {
  SecretStorePicker,
  SecretStorePickerSchema,
} from './components/scaffolder/SecretStorePicker';
import { StepLayout } from './components/scaffolder/StepLayout';
import {
  TemplateStringInput,
  TemplateStringInputSchema,
} from './components/scaffolder/TemplateStringInput';
import {
  YamlValuesEditor,
  YamlValuesEditorSchema,
  yamlValuesEditorValidation,
} from './components/scaffolder/YamlValuesEditor';
import {
  YamlValuesValidation,
  YamlValuesValidationSchema,
} from './components/scaffolder/YamlValuesValidation';

/**
 * Temporary legacy plugin shell for scaffolder field extensions.
 * The scaffolder page is still on the legacy system, so these extensions
 * must be provided via createPlugin/createScaffolderFieldExtension.
 * This will be removed once the scaffolder is migrated to NFS (Phase 2).
 */
export const gsScaffolderPlugin = createPlugin({
  id: 'gs-scaffolder',
});

export const GSChartPickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSChartPicker',
    component: ChartPicker,
    schema: ChartPickerSchema,
  }),
);

export const GSChartTagPickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSChartTagPicker',
    component: ChartTagPicker,
    schema: ChartTagPickerSchema,
  }),
);

export const GSClusterPickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSClusterPicker',
    component: ClusterPicker,
    validation: clusterPickerValidation,
    schema: ClusterPickerSchema,
  }),
);

export const GSProviderConfigPickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSProviderConfigPicker',
    component: ProviderConfigPicker,
    schema: ProviderConfigPickerSchema,
  }),
);

export const GSOIDCTokenFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSOIDCToken',
    component: OIDCToken,
    schema: OIDCTokenSchema,
  }),
);

export const GSInstallationPickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSInstallationPicker',
    component: InstallationPicker,
    schema: InstallationPickerSchema,
    validation: installationPickerValidation,
  }),
);

export const GSReleasePickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSReleasePicker',
    component: ReleasePicker,
    schema: ReleasePickerSchema,
  }),
);

export const GSOrganizationPickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSOrganizationPicker',
    component: OrganizationPicker,
    schema: OrganizationPickerSchema,
  }),
);

export const GSSecretStorePickerFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSSecretStorePicker',
    component: SecretStorePicker,
    schema: SecretStorePickerSchema,
  }),
);

export const GSTemplateStringInputFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSTemplateStringInput',
    component: TemplateStringInput,
    schema: TemplateStringInputSchema,
  }),
);

export const GSYamlValuesEditorFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSYamlValuesEditor',
    component: YamlValuesEditor,
    schema: YamlValuesEditorSchema,
    validation: yamlValuesEditorValidation,
  }),
);

export const GSYamlValuesValidationFieldExtension = gsScaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSYamlValuesValidation',
    component: YamlValuesValidation,
    schema: YamlValuesValidationSchema,
  }),
);

export const GSStepLayout = gsScaffolderPlugin.provide(
  createScaffolderLayout({
    name: 'GSStepLayout',
    component: StepLayout,
  }),
);
