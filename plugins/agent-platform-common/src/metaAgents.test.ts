import { readMetaAgents } from './metaAgents';

function readerOf(values: Record<string, string | undefined>) {
  return {
    getOptionalString: (key: string) => values[key],
  };
}

describe('readMetaAgents', () => {
  it('reads the configured roles and leaves the rest absent', () => {
    expect(
      readMetaAgents(
        readerOf({
          'agentPlatform.metaAgents.skillEvaluation': 'skill-evaluator',
          'agentPlatform.metaAgents.agentManagement': 'kagent/swarm-operator',
        }),
      ),
    ).toEqual({
      skillEvaluation: 'skill-evaluator',
      agentManagement: 'kagent/swarm-operator',
    });
  });

  it('treats a blank value as unconfigured', () => {
    expect(
      readMetaAgents(
        readerOf({ 'agentPlatform.metaAgents.skillEvaluation': '  ' }),
      ),
    ).toEqual({});
  });

  it('reads no roles from an absent config', () => {
    expect(readMetaAgents(undefined)).toEqual({});
  });
});
