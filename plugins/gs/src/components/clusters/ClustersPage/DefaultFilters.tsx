import { KindPicker } from './filters/KindPicker';
import { OrganizationPicker } from './filters/OrganizationPicker';
import { ReleaseVersionPicker } from './filters/ReleaseVersionPicker';
import { StatusPicker } from './filters/StatusPicker';
import { KubernetesVersionPicker } from './filters/KubernetesVersionPicker';
import { AppVersionPicker } from './filters/AppVersionPicker';
import { LocationPicker } from './filters/LocationPicker';
import { ProviderPicker } from './filters/ProviderPicker';
import { LabelPicker } from './filters/LabelPicker';
import { InstallationPicker } from './filters/InstallationPicker';

export const DefaultFilters = () => {
  return (
    <>
      <InstallationPicker />
      <ProviderPicker />
      <LocationPicker />
      <KindPicker />
      <OrganizationPicker />
      <LabelPicker />
      <StatusPicker />
      <AppVersionPicker />
      <ReleaseVersionPicker />
      <KubernetesVersionPicker />
    </>
  );
};
