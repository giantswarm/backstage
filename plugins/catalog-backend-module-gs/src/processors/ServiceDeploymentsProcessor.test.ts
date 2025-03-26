import { ServiceDeploymentsProcessor } from './ServiceDeploymentsProcessor';
import { Entity } from '@backstage/catalog-model';
import { setupEntities } from './testUtils';

describe('ServiceDeploymentsProcessor', () => {
  let processor: ServiceDeploymentsProcessor;

  beforeEach(() => {
    processor = new ServiceDeploymentsProcessor();
  });

  it('should return the entity unchanged if it is not a GS service', async () => {
    const { component, website, service, api, system, user, group } =
      setupEntities();

    expect(await processor.preProcessEntity(component)).toEqual(component);
    expect(await processor.preProcessEntity(website)).toEqual(website);
    expect(await processor.preProcessEntity(service)).toEqual(service);
    expect(await processor.preProcessEntity(api)).toEqual(api);
    expect(await processor.preProcessEntity(system)).toEqual(system);
    expect(await processor.preProcessEntity(user)).toEqual(user);
    expect(await processor.preProcessEntity(group)).toEqual(group);
  });

  it('should process GS service entity and add GS_DEPLOYMENT_NAMES annotation', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'gs-service',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/gs-service',
        },
      },
      spec: {
        type: 'service',
      },
    };

    expect(await processor.preProcessEntity(entity)).toEqual({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'gs-service',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/gs-service',
          'giantswarm.io/deployment-names': 'gs-service,gs-service-app',
        },
      },
      spec: {
        type: 'service',
      },
    });
  });

  it('should handle entity name with "-app" suffix correctly', async () => {
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'gs-service-app',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/gs-service',
        },
      },
      spec: {
        type: 'service',
      },
    };

    expect(await processor.preProcessEntity(entity)).toEqual({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'gs-service-app',
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/gs-service',
          'giantswarm.io/deployment-names': 'gs-service,gs-service-app',
        },
      },
      spec: {
        type: 'service',
      },
    });
  });
});
