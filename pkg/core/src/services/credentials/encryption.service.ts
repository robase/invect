/**
 * Encryption Service
 *
 * Handles encryption and decryption of sensitive credential data
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

interface EncryptionConfig {
  /** Master encryption key (should be loaded from environment variable) */
  masterKey: string;
}

interface EncryptedData {
  /** Encrypted data as base64 string */
  ciphertext: string;
  /** Initialization vector as base64 string */
  iv: string;
  /** Authentication tag as base64 string */
  authTag: string;
  /** Salt used for key derivation as base64 string */
  salt: string;
  /** Algorithm used */
  algorithm: string;
}

export class EncryptionService {
  private masterKey: Buffer;

  constructor(config: EncryptionConfig) {
    if (!config.masterKey) {
      throw new Error('Master encryption key is required');
    }

    // Decode the base64-encoded master key into raw bytes.
    // If the key is not valid base64 (legacy plain-text key), fall back to UTF-8.
    const decoded = Buffer.from(config.masterKey, 'base64');
    this.masterKey =
      decoded.length >= 32 && decoded.toString('base64') === config.masterKey
        ? decoded
        : Buffer.from(config.masterKey, 'utf-8');
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns an object with ciphertext, IV, auth tag, and salt
   */
  encrypt(plaintext: string | object): EncryptedData {
    try {
      // Convert object to string if needed
      const plaintextString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

      // Generate a random salt for key derivation
      const salt = crypto.randomBytes(SALT_LENGTH);

      // Derive a key from the master key and salt using PBKDF2
      const key = crypto.pbkdf2Sync(
        this.masterKey,
        salt,
        100000, // iterations
        32, // key length in bytes (256 bits)
        'sha256',
      );

      // Generate a random initialization vector
      const iv = crypto.randomBytes(IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt the data
      let ciphertext = cipher.update(plaintextString, 'utf8', 'base64');
      ciphertext += cipher.final('base64');

      // Get the authentication tag
      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: ALGORITHM,
      };
    } catch (error) {
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Decrypt data that was encrypted with encrypt()
   * Returns the original plaintext
   */
  decrypt(encrypted: EncryptedData): string {
    try {
      // Parse the encrypted data
      const { ciphertext, iv, authTag, salt, algorithm } = encrypted;

      if (algorithm !== ALGORITHM) {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      // Convert base64 strings back to buffers
      const ivBuffer = Buffer.from(iv, 'base64');
      const authTagBuffer = Buffer.from(authTag, 'base64');
      const saltBuffer = Buffer.from(salt, 'base64');

      // Derive the same key using the stored salt
      const key = crypto.pbkdf2Sync(this.masterKey, saltBuffer, 100000, 32, 'sha256');

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      // Decrypt the data
      let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Encrypt an object and return as an encrypted string
   * Useful for storing in database
   */
  encryptObject<T extends object>(obj: T): string {
    const encrypted = this.encrypt(obj);
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt a string that was encrypted with encryptObject()
   * Returns the original object
   */
  decryptObject<T extends object>(encryptedString: string): T {
    const encrypted = JSON.parse(encryptedString) as EncryptedData;
    const decrypted = this.decrypt(encrypted);
    return JSON.parse(decrypted) as T;
  }

  /**
   * Hash a value using SHA-256
   * Useful for creating searchable hashes of sensitive data
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Generate a cryptographically secure random token
   * Useful for API keys, tokens, etc.
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate encryption key strength
   * Returns true if the key meets minimum security requirements
   */
  static validateMasterKey(key: string): boolean {
    // Minimum 32 characters (256 bits)
    if (key.length < 32) {
      return false;
    }

    // Should contain mix of characters
    const hasUpperCase = /[A-Z]/.test(key);
    const hasLowerCase = /[a-z]/.test(key);
    const hasNumbers = /[0-9]/.test(key);
    const hasSpecial = /[^A-Za-z0-9]/.test(key);

    // Require at least 3 of the 4 character types
    const characterTypes = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecial].filter(
      Boolean,
    ).length;

    return characterTypes >= 3;
  }

  /**
   * Generate a new master key
   * Should be stored securely (e.g., in environment variable or secret manager)
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}

/**
 * Factory function to create encryption service from environment
 */
export function createEncryptionService(): EncryptionService {
  const masterKey = process.env.INVECT_ENCRYPTION_KEY;

  if (!masterKey) {
    throw new Error(
      'INVECT_ENCRYPTION_KEY environment variable is required. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  if (!EncryptionService.validateMasterKey(masterKey)) {
    // Warn about weak encryption key (in production, should throw error)
    throw new Error(
      'Encryption key does not meet security requirements. ' +
        'It should be at least 32 characters and contain a mix of character types.',
    );
  }

  return new EncryptionService({ masterKey });
}
