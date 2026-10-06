import { Navigate, Route, Routes } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { hiveNowRouteRef } from '../../routes';
import { HiveEpicPage } from './HiveEpicPage';

/** `/hive/epics/:id/*`; the bare `/hive/epics` is Now, which lists them. */
export function HiveEpicsRouter() {
  const nowLink = useRouteRef(hiveNowRouteRef);
  return (
    <Routes>
      <Route index element={<Navigate to={nowLink?.() ?? '..'} replace />} />
      <Route path=":id/*" element={<HiveEpicPage />} />
    </Routes>
  );
}
