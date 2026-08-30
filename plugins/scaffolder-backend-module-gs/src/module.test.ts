import { startTestBackend } from '@backstage/backend-test-utils';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { scaffolderTemplatingExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
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
            addTemplateFilters: (filters: Record<string, unknown>) => {
              filterNames.push(...Object.keys(filters));
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
