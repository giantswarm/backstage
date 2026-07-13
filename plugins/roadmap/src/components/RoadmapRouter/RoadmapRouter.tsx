import { Routes, Route } from 'react-router-dom';
import { RoadmapPage } from '../RoadmapPage';
import { ItemDetailPage } from '../ItemDetailPage';

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
      <Route path="items/:id" element={<ItemDetailPage />} />
    </Routes>
  );
};
