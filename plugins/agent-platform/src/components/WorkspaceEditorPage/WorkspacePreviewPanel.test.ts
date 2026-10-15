import { whyText } from './WorkspacePreviewPanel';

describe('whyText', () => {
  it('says a repository picked by name is picked by name', () => {
    expect(whyText(['name'])).toBe('Picked by name');
  });

  it('names the language and topics a repository matches', () => {
    expect(whyText(['language Go', 'topic mcp'])).toBe(
      'Matches language Go, topic mcp',
    );
  });

  it('gives both reasons when a repository is in for both', () => {
    expect(whyText(['name', 'language Go'])).toBe(
      'Picked by name; Matches language Go',
    );
  });
});
