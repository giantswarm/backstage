import { Route, Routes } from 'react-router-dom';
import { CreateRepositoryPage } from './CreateRepositoryPage';
import { RepositoriesPage } from './RepositoriesPage';
import { RepositoriesProviders } from './RepositoriesProviders';

/** `/repositories`: the inventory; `/repositories/create`: the declaration form. */
export function RepositoriesRouter() {
  return (
    <RepositoriesProviders>
      <Routes>
        <Route index element={<RepositoriesPage />} />
        <Route path="create" element={<CreateRepositoryPage />} />
      </Routes>
    </RepositoriesProviders>
  );
}
