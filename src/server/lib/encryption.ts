/**
 * AES-256-GCM encryption utility for API keys and secrets.
 * 
 * Uses ENCRYPTION_KEY env variable (32-byte hex string) or falls back to a
 * derived key from AUTH_SECRET. In production, always set ENCRYPTION_KEY.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, 'hex');
  }
  // Derive a 32-byte key from AUTH_SECRET as fallback
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'serviflow-default-key';
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv (12) + encrypted (N) + authTag (16) → base64
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext.
 * Returns the original plaintext string.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Encrypts a value only if it's non-null and non-empty.
 * Returns null for null/empty input (safe for Prisma nullable fields).
 */
export function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') return null;
  return encrypt(value);
}

/**
 * Decrypts a value only if it's non-null and non-empty.
 * Returns null for null/empty input.
 */
export function decryptIfPresent(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}
