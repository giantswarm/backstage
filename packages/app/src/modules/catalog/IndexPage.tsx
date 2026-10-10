import { PageBlueprint } from '@backstage/frontend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import FolderIcon from '@material-ui/icons/Folder';

// Catalog index page — render GSCustomCatalogPage with the NFS page header
export const IndexPage = PageBlueprint.makeWithOverrides({
  factory(originalFactory) {
    return originalFactory({
      title: 'Catalog',
      icon: <FolderIcon fontSize="inherit" />,
      routeRef: catalogPlugin.routes.catalogIndex,
      path: '/catalog',
      loader: async () => {
        const { GSCustomCatalogPage } =
          await import('@giantswarm/backstage-plugin-gs');
        return <GSCustomCatalogPage />;
      },
    });
  },
});
