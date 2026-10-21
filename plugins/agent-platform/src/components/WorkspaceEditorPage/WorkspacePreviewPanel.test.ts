import { formatQuantity, whyText } from './WorkspacePreviewPanel';

describe('whyText', () => {
  it('says a repository picked by name is picked by name', () => {
    expect(whyText(['name'])).toBe('picked by name');
  });

  it('names the topics a repository matches', () => {
    expect(whyText(['language Go', 'topic mcp'])).toBe('matches topic mcp');
  });

  it('names the language filter when no topic took it', () => {
    expect(whyText(['language Go'])).toBe('matches the language filter');
  });

  it('says picked by name when a repository is in for both', () => {
    expect(whyText(['name', 'language Go'])).toBe('picked by name');
  });
});

describe('formatQuantity', () => {
  it('reads a Kubernetes quantity as people do', () => {
    expect(formatQuantity('8Gi')).toBe('8 GiB');
    expect(formatQuantity('512Mi')).toBe('512 MiB');
  });
});
