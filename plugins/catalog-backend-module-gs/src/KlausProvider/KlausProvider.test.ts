import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type {
  EntityProviderConnection,
  DeferredEntity,
} from '@backstage/plugin-catalog-node';
import { KlausProvider } from './KlausProvider';
import type { KlausInstanceConfig } from './config';
import { discoverPersonalities } from './discoverPersonalities';
import { discoverToolchains } from './discoverToolchains';
import { discoverPlugins } from './discoverPlugins';

jest.mock('./discoverPersonalities');
jest.mock('./discoverToolchains');
jest.mock('./discoverPlugins');

const discoverPersonalitiesMock = discoverPersonalities as jest.MockedFunction<
  typeof discoverPersonalities
>;
const discoverToolchainsMock = discoverToolchains as jest.MockedFunction<
  typeof discoverToolchains
>;
const discoverPluginsMock = discoverPlugins as jest.MockedFunction<
  typeof discoverPlugins
>;

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'fake-token' }),
} as unknown as GithubCredentialsProvider;

const publicInstance: KlausInstanceConfig = {
  id: 'public',
  system: 'klaus',
  owner: 'team-bumblebee',
  namePostfix: '',
  titlePostfix: '',
  tags: ['public'],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
  personalities: {
    kind: 'personalities',
    sourceRepository: 'https://github.com/giantswarm/klaus-personalities',
    owner: 'giantswarm',
    repo: 'klaus-personalities',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-personalities',
  },
  toolchains: {
    kind: 'toolchains',
    sourceRepository: 'https://github.com/giantswarm/klaus-toolchains',
    owner: 'giantswarm',
    repo: 'klaus-toolchains',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains',
  },
  plugins: {
    kind: 'plugins',
    sourceRepository: 'https://github.com/giantswarm/klaus-plugins',
    owner: 'giantswarm',
    repo: 'klaus-plugins',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-plugins',
  },
};

const internalInstance: KlausInstanceConfig = {
  id: 'internal',
  system: 'klaus',
  owner: 'team-bumblebee',
  namePostfix: '-internal',
  titlePostfix: ' (internal)',
  tags: ['internal'],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
  plugins: {
    kind: 'plugins',
    sourceRepository: 'https://github.com/giantswarm/klaus-plugins-internal',
    owner: 'giantswarm',
    repo: 'klaus-plugins-internal',
    ociRepository: 'gsociprivate.azurecr.io/giantswarm/klaus-plugins',
  },
};

function makeConnection() {
  const applyMutation = jest.fn().mockResolvedValue(undefined);
  const refresh = jest.fn().mockResolvedValue(undefined);
  return {
    applyMutation,
    refresh,
  } as unknown as EntityProviderConnection & {
    applyMutation: jest.Mock;
    refresh: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  discoverPersonalitiesMock.mockResolvedValue([]);
  discoverToolchainsMock.mockResolvedValue([]);
  discoverPluginsMock.mockResolvedValue([]);
});

describe('KlausProvider.fromConfig', () => {
  it('returns an empty array when no klaus config is present', () => {
    const config = new ConfigReader({ catalog: { providers: {} } });
    const providers = KlausProvider.fromConfig({
      config,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
    });
    expect(providers).toEqual([]);
  });

  it('returns one provider per configured instance with unique names', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          klaus: {
            public: {
              owner: 'team-bumblebee',
              personalities: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-personalities',
                ociRepository:
                  'gsoci.azurecr.io/giantswarm/klaus-personalities',
              },
            },
            internal: {
              owner: 'team-bumblebee',
              namePostfix: '-internal',
              plugins: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-plugins-internal',
                ociRepository:
                  'gsociprivate.azurecr.io/giantswarm/klaus-plugins',
              },
            },
          },
        },
      },
    });

    const providers = KlausProvider.fromConfig({
      config,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
    });

    expect(providers).toHaveLength(2);
    expect(providers.map(p => p.getProviderName())).toEqual([
      'klaus-provider:public',
      'klaus-provider:internal',
    ]);
  });
});

describe('KlausProvider', () => {
  it('refresh throws if not connected', async () => {
    const provider = new KlausProvider({
      instance: publicInstance,
      allInstances: [publicInstance],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
    });
    await expect(provider.refresh()).rejects.toThrow(/not connected/);
  });

  it('connect registers a scheduled task with the provider-specific id', async () => {
    const scheduler = mockServices.scheduler.mock();
    const scheduleTaskSpy = jest.spyOn(scheduler, 'scheduleTask');
    const provider = new KlausProvider({
      instance: publicInstance,
      allInstances: [publicInstance],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler,
    });
    await provider.connect(makeConnection());
    expect(scheduleTaskSpy).toHaveBeenCalledTimes(1);
    const arg = scheduleTaskSpy.mock.calls[0][0];
    expect(arg.id).toBe('klaus-provider:public:refresh');
    expect(typeof arg.fn).toBe('function');
  });

  it('refresh discovers all configured sources and applies a full mutation', async () => {
    discoverPersonalitiesMock.mockResolvedValue([
      {
        name: 'sre',
        source: publicInstance.personalities!,
        branch: 'main',
        toolchain: {
          repository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains/go',
          tag: '0.1.12',
        },
        plugins: [
          {
            repository:
              'gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base',
            tag: 'v0.9.0',
          },
        ],
      },
    ]);
    discoverToolchainsMock.mockResolvedValue([
      {
        name: 'go',
        dirName: 'klaus-go',
        source: publicInstance.toolchains!,
        branch: 'main',
      },
    ]);
    discoverPluginsMock.mockResolvedValue([
      {
        name: 'base',
        source: publicInstance.plugins!,
        branch: 'main',
        pluginDir: 'plugins/base',
      },
    ]);

    const connection = makeConnection();
    const provider = new KlausProvider({
      instance: publicInstance,
      allInstances: [publicInstance, internalInstance],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
    });

    await provider.connect(connection);
    await provider.refresh();

    expect(discoverPersonalitiesMock).toHaveBeenCalledTimes(1);
    expect(discoverToolchainsMock).toHaveBeenCalledTimes(1);
    expect(discoverPluginsMock).toHaveBeenCalledTimes(1);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const mutation = connection.applyMutation.mock.calls[0][0];
    expect(mutation.type).toBe('full');
    const entities: DeferredEntity[] = mutation.entities;
    expect(entities).toHaveLength(3);
    const names = entities.map(e => e.entity.metadata.name).sort();
    expect(names).toEqual([
      'klaus-personality-sre',
      'klaus-plugin-base',
      'klaus-toolchain-go',
    ]);

    const personality = entities.find(
      e => e.entity.metadata.name === 'klaus-personality-sre',
    )!;
    expect(
      (personality.entity.spec as { dependsOn: string[] }).dependsOn,
    ).toEqual([
      'component:default/klaus-toolchain-go',
      'component:default/klaus-plugin-gs-base-internal',
    ]);
  });

  it('skips discovery for sources that are not configured', async () => {
    const instance: KlausInstanceConfig = {
      ...publicInstance,
      toolchains: undefined,
      plugins: undefined,
    };
    const provider = new KlausProvider({
      instance,
      allInstances: [instance],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
    });
    await provider.connect(makeConnection());
    await provider.refresh();
    expect(discoverPersonalitiesMock).toHaveBeenCalledTimes(1);
    expect(discoverToolchainsMock).not.toHaveBeenCalled();
    expect(discoverPluginsMock).not.toHaveBeenCalled();
  });

  it('continues with the other sources when one discovery fails', async () => {
    discoverPersonalitiesMock.mockRejectedValue(new Error('boom'));
    discoverToolchainsMock.mockResolvedValue([
      {
        name: 'go',
        dirName: 'klaus-go',
        source: publicInstance.toolchains!,
        branch: 'main',
      },
    ]);
    discoverPluginsMock.mockResolvedValue([]);

    const connection = makeConnection();
    const provider = new KlausProvider({
      instance: publicInstance,
      allInstances: [publicInstance],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
    });
    await provider.connect(connection);
    await provider.refresh();
    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const entities: DeferredEntity[] =
      connection.applyMutation.mock.calls[0][0].entities;
    expect(entities.map(e => e.entity.metadata.name)).toEqual([
      'klaus-toolchain-go',
    ]);
  });
});
