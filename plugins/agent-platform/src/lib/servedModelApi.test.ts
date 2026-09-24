import {
  INTERFACE_LABELS,
  interfaceLabel,
  requestAuthOf,
  requestExamples,
  requestModelOf,
  sortInterfaces,
} from './servedModelApi';

const generate = [
  { type: 'AnthropicTokenCount', path: '/v1/messages/count_tokens' },
  { type: 'Messages', path: '/v1/messages' },
  { type: 'Responses', path: '/v1/responses' },
  { type: 'Completions', path: '/v1/chat/completions' },
];

describe('interface labels', () => {
  it('reads agentgateway’s format names as a person does, in a fixed order', () => {
    expect(INTERFACE_LABELS.map(entry => entry.label)).toEqual([
      'Chat completions',
      'Responses',
      'Messages',
      'count_tokens',
      'Embeddings',
    ]);
    expect(interfaceLabel('Completions')).toBe('Chat completions');
    expect(interfaceLabel('AnthropicTokenCount')).toBe('count_tokens');
    expect(interfaceLabel('Realtime')).toBe('Realtime');
  });

  it('sorts a server’s list into the row’s order, unknown ones last', () => {
    expect(
      sortInterfaces([
        { type: 'Realtime', path: '/v1/realtime' },
        ...generate,
      ]).map(api => api.type),
    ).toEqual([
      'Completions',
      'Responses',
      'Messages',
      'AnthropicTokenCount',
      'Realtime',
    ]);
  });
});

describe('requestExamples', () => {
  const routed = {
    name: 'qwen2-5-0-5b-cpu',
    modelSource: 'Qwen/Qwen2.5-0.5B-Instruct',
    interfaces: generate,
  };
  const gateway = 'https://models.lab.example/model-serving/qwen2-5-0-5b-cpu';

  it('fills one request per interface with the URL, the model id and the person’s token on the models Gateway', () => {
    const examples = requestExamples(routed, gateway);
    expect(examples.map(example => example.label)).toEqual([
      'Chat completions',
      'Responses',
      'Messages',
      'count_tokens',
    ]);
    const chat = examples[0];
    expect(chat.url).toBe(`${gateway}/v1/chat/completions`);
    expect(chat.command).toContain(`curl -sS ${gateway}/v1/chat/completions`);
    expect(chat.command).toContain('-H "Authorization: Bearer $TOKEN"');
    expect(chat.command).toContain('"model":"Qwen/Qwen2.5-0.5B-Instruct"');
    expect(chat.command).not.toContain('anthropic-version');
    const body = JSON.parse(chat.command.split("-d '")[1].slice(0, -1));
    expect(body).toEqual({
      model: 'Qwen/Qwen2.5-0.5B-Instruct',
      messages: [{ role: 'user', content: 'Say hello in five words.' }],
      max_tokens: 64,
    });
    expect(examples[2].command).toContain('-H "anthropic-version: 2023-06-01"');
    expect(examples[3].command).toContain('anthropic-version');
  });

  it('sends the public name on the LLM endpoint, keyless in-cluster and with an API key outside', () => {
    const onEndpoint = { ...routed, publicName: 'qwen2-5-0-5b-cpu' };
    const inCluster = 'http://agentgateway.agent-platform.svc:8081';
    const [chat] = requestExamples(onEndpoint, inCluster);
    expect(chat.command).toContain('"model":"qwen2-5-0-5b-cpu"');
    expect(chat.command).not.toContain('Authorization');
    expect(requestAuthOf(onEndpoint, inCluster).note).toContain('no key');
    const [external] = requestExamples(onEndpoint, 'https://llm.lab.example/');
    expect(external.url).toBe('https://llm.lab.example/v1/chat/completions');
    expect(external.command).toContain('Bearer $LLM_API_KEY');
  });

  it('asks an embeddings model for an embedding, and nothing without interfaces', () => {
    const embed = {
      name: 'bge',
      modelSource: 'BAAI/bge-small-en-v1.5',
      interfaces: [{ type: 'Embeddings', path: '/v1/embeddings' }],
    };
    const [example] = requestExamples(
      embed,
      'http://bge-kserve-workload-svc.model-serving.svc.cluster.local:8000',
    );
    expect(example.label).toBe('Embeddings');
    expect(example.command).toContain('"input":"Say hello in five words."');
    expect(requestExamples({ ...embed, interfaces: [] }, 'http://x')).toEqual(
      [],
    );
    expect(
      requestExamples({ ...embed, interfaces: undefined }, 'http://x'),
    ).toEqual([]);
  });

  it('names the model as the ModelConfig does when no public name', () => {
    expect(requestModelOf(routed)).toBe('Qwen/Qwen2.5-0.5B-Instruct');
    expect(requestModelOf({ ...routed, publicName: 'tiny' })).toBe('tiny');
  });
});
