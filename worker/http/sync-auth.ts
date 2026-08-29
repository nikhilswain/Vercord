const BEARER_PREFIX = 'Bearer ';
const MAX_CANDIDATE_LENGTH = 512;
const visibleAsciiPattern = /^[\x21-\x7e]+$/;

export async function authorizeSyncRequest(
  authorizationHeader: string | null,
  expectedSecret: string,
): Promise<boolean> {
  if (authorizationHeader === null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const candidate = authorizationHeader.slice(BEARER_PREFIX.length);
  if (
    candidate.length === 0 ||
    candidate.length > MAX_CANDIDATE_LENGTH ||
    !visibleAsciiPattern.test(candidate)
  ) {
    return false;
  }

  const encoder = new TextEncoder();
  const [expectedDigest, candidateDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expectedSecret)),
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
  ]);
  const expectedBytes = new Uint8Array(expectedDigest);
  const candidateBytes = new Uint8Array(candidateDigest);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index]! ^ candidateBytes[index]!;
  }
  return difference === 0;
}
