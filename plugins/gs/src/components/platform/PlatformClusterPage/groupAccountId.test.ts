import { groupAccountId } from './PlatformClusterPage';

describe('groupAccountId', () => {
  it('groups a 12-digit AWS account ID in fours', () => {
    expect(groupAccountId('123456789012')).toBe('1234 5678 9012');
  });

  it('leaves anything else as it is', () => {
    expect(groupAccountId('12345')).toBe('12345');
    expect(groupAccountId('3f2a91c0-6d1e')).toBe('3f2a91c0-6d1e');
  });
});
