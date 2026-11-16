import type { MusterApi } from '../../../apis';

const SERVER = 'sample';

export const SAMPLE_TOOLS = {
  read: 'read_thing',
  write: 'write_thing',
  unused: 'unused_thing',
} as const;

export type SampleTool = (typeof SAMPLE_TOOLS)[keyof typeof SAMPLE_TOOLS];

export function sampleToolName(tool: SampleTool): string {
  return `x_${SERVER}_${tool}`;
}

/** A wrapper whose callers name the tool. */
export function callSample(api: MusterApi, tool: SampleTool) {
  return api.callTool(sampleToolName(tool), {});
}

export class SampleClient {
  constructor(private readonly api: MusterApi) {}

  private async call<T>(tool: SampleTool): Promise<T> {
    return (await this.api.callToolWithProgress(
      sampleToolName(tool),
      {},
      { onProgress: () => {} },
    )) as T;
  }

  read() {
    return this.call<string>(SAMPLE_TOOLS.read);
  }
}

export function calls(api: MusterApi, edit: boolean, name: string) {
  const { callTool } = api;
  return Promise.all([
    callSample(api, SAMPLE_TOOLS.write),
    callTool('core_destructured', {}),
    // eslint-disable-next-line dot-notation -- the bracket form is what is sampled.
    api['callTool']('core_bracket', {}),
    api.callTool(edit ? 'core_update' : 'core_create', {}),
    api.callTool('core_' + 'joined', {}),
    api.callTool(name, {}),
  ]);
}
