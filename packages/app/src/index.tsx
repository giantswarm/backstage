import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import app from './App';
import '@backstage/ui/css/styles.css';
// Local bui fixes; must load after the bui stylesheet above.
import './bui-overrides.css';

// In new frontend system, app is a React element, not a component
ReactDOM.createRoot(document.getElementById('root')!).render(app);
