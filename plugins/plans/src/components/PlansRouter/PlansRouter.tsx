import { Routes, Route } from 'react-router-dom';
import { PlansPage } from '../PlansPage';
import { PullReviewPage } from '../PullReviewPage';

/**
 * Routing within the plans page: the list view and the per-PR review page.
 * Mounted inside PlansProviders by the page loader in plugin.tsx, so both
 * views share one query cache. Repo selection travels as a `?repo=` query
 * param so review-page URLs are shareable.
 */
export const PlansRouter = () => {
  return (
    <Routes>
      <Route index element={<PlansPage />} />
      <Route path="pr/:number" element={<PullReviewPage />} />
    </Routes>
  );
};
