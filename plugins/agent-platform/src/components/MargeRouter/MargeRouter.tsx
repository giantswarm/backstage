import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Progress } from '@backstage/core-components';

import { useTeams } from '../../hooks/useTeams';
import { MargePage } from '../MargePage';
import { QueryClientProvider } from '../QueryClientProvider';

/**
 * The tab index: the person's own team when the catalogue knows one, the
 * first team it lists otherwise. An empty catalogue lands on the page with no
 * team, where the selector's free field is the way in.
 */
function IndexRedirect() {
  const { search } = useLocation();
  const { defaultTeam, teams, isLoading } = useTeams();
  if (isLoading) {
    return <Progress />;
  }
  const team = defaultTeam ?? teams[0];
  return <Navigate to={{ pathname: team ?? '-', search }} replace />;
}

/**
 * Content of the "marge" tab: one team's queue per URL
 * (`/agent-platform/marge/<team>`), with the index redirecting to the
 * person's own team. Mounted as the tab's content (a descendant `<Routes>`),
 * so the paths are relative, as in the other tab routers.
 *
 * `-` is the placeholder team of a portal whose catalogue lists no team at
 * all: the page then shows the selector with nothing selected.
 */
export const MargeRouter = () => {
  return (
    <QueryClientProvider>
      <Routes>
        <Route index element={<IndexRedirect />} />
        <Route path=":team" element={<MargePage />} />
      </Routes>
    </QueryClientProvider>
  );
};
