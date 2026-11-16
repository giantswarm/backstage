import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import { dropQueryCachesOfOtherFixtureScenario } from '@giantswarm/backstage-plugin-gs-common';
import app from './App';
import '@backstage/ui/css/styles.css';
// Local bui fixes; must load after the bui stylesheet above.
import './bui-overrides.css';

// Fixture mode's scenarios (docs/fixtures.md): the persisted query caches of
// another scenario would be restored before any fixture API answers.
if (process.env.NODE_ENV !== 'production') {
  dropQueryCachesOfOtherFixtureScenario();
}

// In new frontend system, app is a React element, not a component
ReactDOM.createRoot(document.getElementById('root')!).render(app);
