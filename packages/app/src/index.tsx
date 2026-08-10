import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import app from './App';
// Roboto is the Giant Swarm brand typeface. Self-hosted rather than loaded from
// Google Fonts: the app's CSP has no `font-src` allowlist for external hosts.
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@backstage/ui/css/styles.css';
// Local bui fixes; must load after the bui stylesheet above.
import './bui-overrides.css';

// In new frontend system, app is a React element, not a component
ReactDOM.createRoot(document.getElementById('root')!).render(app);
