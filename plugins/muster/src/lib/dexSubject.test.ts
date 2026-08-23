import { decodeDexSubject } from './dexSubject';

describe('decodeDexSubject', () => {
  it('decodes a dex protobuf subject', () => {
    expect(decodeDexSubject('CgUzMjQ4OBIRZ2lhbnRzd2FybS1naXRodWI')).toBe(
      'giantswarm-github user 32488',
    );
  });

  it('passes through non-subject identities', () => {
    expect(decodeDexSubject('timo@giantswarm.io')).toBeUndefined();
    expect(decodeDexSubject('some-user')).toBeUndefined();
    expect(decodeDexSubject('')).toBeUndefined();
  });

  it('rejects base64url that is not a dex subject', () => {
    // valid base64url, but the bytes are not IDTokenSubject protobuf
    expect(decodeDexSubject('aGVsbG8gd29ybGQhIQ')).toBeUndefined();
  });
});
