import { extractFencedBlocks } from './fencedBlocks';

describe('extractFencedBlocks', () => {
  it('extracts a fenced block with its info string', () => {
    const text = [
      'Here is a draft:',
      '```md',
      'You are a support triage agent.',
      'Never close tickets on your own.',
      '```',
      'Adjust as you like.',
    ].join('\n');

    expect(extractFencedBlocks(text)).toEqual([
      {
        info: 'md',
        code: 'You are a support triage agent.\nNever close tickets on your own.',
      },
    ]);
  });

  it('extracts several blocks in order, bare fences included', () => {
    const text = [
      '```',
      'first',
      '```',
      'and',
      '~~~yaml',
      'second',
      '~~~',
    ].join('\n');

    expect(extractFencedBlocks(text)).toEqual([
      { info: '', code: 'first' },
      { info: 'yaml', code: 'second' },
    ]);
  });

  it('keeps shorter fences inside a longer one as content', () => {
    const text = ['````', '```', 'nested', '```', '````'].join('\n');

    expect(extractFencedBlocks(text)).toEqual([
      { info: '', code: '```\nnested\n```' },
    ]);
  });

  it('yields nothing for an unclosed fence, as mid-stream text has', () => {
    expect(extractFencedBlocks('```\nstill being writ')).toEqual([]);
  });

  it('does not treat inline code with backticks in the info as a fence', () => {
    expect(extractFencedBlocks('``` `inline` ``` and no block')).toEqual([]);
  });

  it('extracts nothing from prose without fences', () => {
    expect(extractFencedBlocks('Just a plain reply.')).toEqual([]);
  });
});
