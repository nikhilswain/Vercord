const encoder = new TextEncoder();
const encryptionContext = encoder.encode('dmap-discord-session-v1');

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('AUTH_VALUE_INVALID');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSessionKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function createOpaqueToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashOpaqueToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function encryptSessionValue(
  value: string,
  secret: Uint8Array,
): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encryptionContext },
    await importSessionKey(secret),
    encoder.encode(value),
  );
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  };
}

export async function decryptSessionValue(
  encrypted: EncryptedValue,
  secret: Uint8Array,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(encrypted.iv),
      additionalData: encryptionContext,
    },
    await importSessionKey(secret),
    base64UrlToBytes(encrypted.ciphertext),
  );
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(plaintext);
}
