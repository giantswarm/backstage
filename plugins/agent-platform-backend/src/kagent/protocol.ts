/**
 * gRPC metadata key a2a-go reads the caller's A2A protocol version from. A
 * call without it is taken as protocol 0.3 and, on a server speaking 1.0,
 * refused with `VersionNotSupported`.
 */
export const A2A_VERSION_HEADER = 'a2a-version';

/** The A2A protocol version of the `lf.a2a.v1` service this client calls. */
export const A2A_PROTOCOL_VERSION = '1.0';
