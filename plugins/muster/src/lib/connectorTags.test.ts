import { TAGS_ANNOTATION } from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer, TOOL_GROUP_LABEL } from './k8s';
import {
  connectorTags,
  isRegisteredRow,
  RETIRED_CONNECTOR_GROUP_TAGS,
  rowTags,
} from './connectorTags';

function makeServer(opts: {
  name: string;
  family?: string;
  toolGroup?: string;
  tags?: string;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        labels: opts.toolGroup ? { [TOOL_GROUP_LABEL]: opts.toolGroup } : {},
        annotations: opts.tags ? { [TAGS_ANNOTATION]: opts.tags } : {},
      },
      spec: opts.family ? { family: { name: opts.family } } : {},
    } as never,
    'gazelle',
  );
}

describe('connectorTags', () => {
  it('derives a tag from the tool-group label, before the servers’ own', () => {
    const tags = (toolGroup?: string, own?: string) =>
      connectorTags([makeServer({ name: 's', toolGroup, tags: own })]);
    expect(tags('infrastructure', 'k8s')).toEqual(['infrastructure', 'k8s']);
    expect(tags('agent-platform')).toEqual(['agent-platform']);
    expect(tags(undefined, 'jira')).toEqual(['jira']);
    // A typo in a chart's values is no declared group.
    expect(tags('agent-plat')).toEqual([]);
    // A tag the annotation repeats is listed once.
    expect(tags('infrastructure', 'infrastructure')).toEqual([
      'infrastructure',
    ]);
  });

  it('gives a family its members’ vote and every member’s own tags', () => {
    expect(
      connectorTags([
        makeServer({
          name: 'a-kubernetes',
          family: 'kubernetes',
          toolGroup: 'infrastructure',
          tags: 'k8s',
        }),
        makeServer({ name: 'b-kubernetes', family: 'kubernetes', tags: 'mc' }),
      ]),
    ).toEqual(['infrastructure', 'k8s', 'mc']);
  });
});

describe('rowTags', () => {
  it('tags muster itself agent-platform', () => {
    expect(rowTags({ kind: 'core' })).toEqual(['agent-platform']);
  });
});

describe('isRegisteredRow', () => {
  it('is true for a connector without a tool-group label only', () => {
    const row = (toolGroup?: string) =>
      isRegisteredRow({
        kind: 'server',
        server: makeServer({ name: 's', toolGroup }),
      });
    expect(row()).toBe(true);
    expect(row('infrastructure')).toBe(false);
    expect(row('agent-platform')).toBe(false);
    expect(isRegisteredRow({ kind: 'core' })).toBe(false);
  });
});

describe('RETIRED_CONNECTOR_GROUP_TAGS', () => {
  it('sends each retired sub-tab to the tag that replaced it', () => {
    expect(RETIRED_CONNECTOR_GROUP_TAGS).toEqual({
      infrastructure: 'infrastructure',
      families: 'infrastructure',
      internal: 'agent-platform',
    });
  });
});
