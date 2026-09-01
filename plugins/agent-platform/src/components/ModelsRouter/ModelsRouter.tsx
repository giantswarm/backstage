import { Routes, Route } from 'react-router-dom';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelsIndexPage } from '../ModelsIndexPage';
import { NewModelPage } from '../NewModelPage';
import { ModelDetailPage } from '../ModelDetailPage';

// Content of the "Models" tab: the list, the create form, and one model's
// editable detail form. Mounted as the tab's content (a descendant `<Routes>`),
// so the paths here are relative — no leading slash — matching AgentsRouter.
//
// `new` (one segment) can never be swallowed by the three-segment detail path:
// react-router matches on segment count and ranks static segments above
// dynamic ones.
export const ModelsRouter = () => {
  return (
    <QueryClientProvider>
      <Routes>
        <Route index element={<ModelsIndexPage />} />
        <Route path="new" element={<NewModelPage />} />
        <Route
          path=":installation/:namespace/:name"
          element={<ModelDetailPage />}
        />
      </Routes>
    </QueryClientProvider>
  );
};
