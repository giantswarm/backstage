import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import { fixtureScenarioOfPage } from '@giantswarm/backstage-plugin-gs-common';
import app from './App';
import '@backstage/ui/css/styles.css';
// Local bui fixes; must load after the bui stylesheet above.
import './bui-overrides.css';

// Fixture mode's scenario (docs/fixtures.md), read before the app renders, so
// a redirect that drops the `fixtures` parameter cannot lose it.
if (process.env.NODE_ENV !== 'production') {
  fixtureScenarioOfPage();
}

// In new frontend system, app is a React element, not a component
ReactDOM.createRoot(document.getElementById('root')!).render(app);
