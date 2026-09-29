import { forgottenFork, strayTool } from '../fixtures/records';
import { adoptEntry, fromReality, presetOf } from './declaration';

describe('fromReality', () => {
  it('starts the declaration from what GitHub knows: description, visibility, language; generator off, not opted in', () => {
    const form = fromReality(strayTool);
    expect(form).toMatchObject({
      team: '',
      name: 'stray-tool',
      componentType: 'unspecified',
      language: 'go',
      flavours: ['generic'],
      description: 'A tool somebody forked and forgot',
      visibility: 'public',
      ciGenerate: false,
      align: false,
      reason: '',
    });
  });

  it('is the Other preset for a private repository in no language devctl builds', () => {
    const form = fromReality(forgottenFork);
    expect(form).toMatchObject({
      language: 'generic',
      description: '',
      visibility: '',
    });
    expect(presetOf(form)).toBe('other');
  });
});

describe('adoptEntry', () => {
  it("is the form's entry, with the lifecycle when the adoption ends the repository's life", () => {
    const form = { ...fromReality(strayTool), team: 'team-bumblebee' };
    expect(adoptEntry(form)).toEqual({
      name: 'stray-tool',
      componentType: 'unspecified',
      gen: { language: 'go', flavours: ['generic'], ci: { generate: false } },
      description: 'A tool somebody forked and forgot',
      visibility: 'public',
    });
    expect(adoptEntry(form, 'archived')).toMatchObject({
      name: 'stray-tool',
      lifecycle: 'archived',
    });
    // The opt-in is the manager's to add beside a lifecycle.
    expect(adoptEntry(form, 'archived')).not.toHaveProperty('align');
  });
});
