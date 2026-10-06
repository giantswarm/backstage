import { Navigate, Routes, Route, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { RoadmapPage } from '../RoadmapPage';
import { ItemDetailPage } from '../ItemDetailPage';
import { epicPageExternalRouteRef } from '../../routes';

/**
 * An item's detail: its epic page in Hive when the plans plugin provides
 * one (an old `items/:id` link lands there), the roadmap's own otherwise.
 */
function ItemRoute() {
  const epicPage = useRouteRef(epicPageExternalRouteRef);
  const { id } = useParams();
  if (epicPage && id) {
    return <Navigate to={epicPage({ id })} replace />;
  }
  return <ItemDetailPage />;
}

/**
 * Routing within the roadmap page: the board/activity views and the
 * per-item detail page. Mounted inside RoadmapProviders by the page loader
 * in plugin.tsx, so all views share one query cache. Filter selections
 * travel as query params so URLs are shareable.
 */
export const RoadmapRouter = () => {
  return (
    <Routes>
      <Route index element={<RoadmapPage />} />
      <Route path="items/:id" element={<ItemRoute />} />
    </Routes>
  );
};
