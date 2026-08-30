import { startTestBackend } from '@backstage/backend-test-utils';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import {
  scaffolderTemplatingExtensionPoint,
  ScaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import { scaffolderModuleGS } from './module';

describe('scaffolderModuleGS', () => {
  it('registers the kube:apply action and the template filters', async () => {
    const actionIds: string[] = [];
    const filterNames: string[] = [];

    await startTestBackend({
      extensionPoints: [
        [
          scaffolderActionsExtensionPoint,
          {
            addActions: (...actions: { id: string }[]) => {
              actionIds.push(...actions.map(action => action.id));
            },
          },
        ],
        [
          scaffolderTemplatingExtensionPoint,
          {
            addTemplateFilters: (
              filters: Parameters<
                ScaffolderTemplatingExtensionPoint['addTemplateFilters']
              >[0],
            ) => {
              filterNames.push(
                ...(Array.isArray(filters)
                  ? filters.map(filter => filter.id)
                  : Object.keys(filters)),
              );
            },
            addTemplateGlobals: () => {},
          },
        ],
      ],
      features: [scaffolderModuleGS],
    });

    expect(actionIds).toContain('kube:apply');
    expect(filterNames).toEqual(
      expect.arrayContaining(['parseClusterRef', 'fromJson']),
    );
  });
});
