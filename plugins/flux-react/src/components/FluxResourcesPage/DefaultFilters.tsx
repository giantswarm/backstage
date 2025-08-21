import { ClusterPicker, KindPicker, StatusPicker } from './filters';

export function DefaultFilters() {
  return (
    <>
      <ClusterPicker />
      <KindPicker />
      <StatusPicker />
    </>
  );
}
