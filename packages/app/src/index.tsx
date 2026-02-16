import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import app from './App';
import '@backstage/ui/css/styles.css';

// In new frontend system, app is a React element, not a component
ReactDOM.createRoot(document.getElementById('root')!).render(app);
