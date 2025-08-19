import { KindPicker } from './filters/KindPicker';
import { TargetClusterPicker } from './filters/TargetClusterPicker';
import { TargetClusterKindPicker } from './filters/TargetClusterKindPicker';
import { VersionPicker } from './filters/VersionPicker';
import { NamespacePicker } from './filters/NamespacePicker';
import { StatusPicker } from './filters/StatusPicker';
import { LabelPicker } from './filters/LabelPicker';
import { AppPicker } from './filters/AppPicker';
import { InstallationPicker } from './filters/InstallationPicker';

export const DefaultFilters = () => {
  return (
    <>
      <InstallationPicker />
      <AppPicker />
      <VersionPicker />
      <TargetClusterPicker />
      <NamespacePicker />
      <TargetClusterKindPicker />
      <LabelPicker />
      <StatusPicker />
      <KindPicker />
    </>
  );
};
