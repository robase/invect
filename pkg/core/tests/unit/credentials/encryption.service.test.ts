/**
 * Unit tests for EncryptionService
 *
 * Validates AES-256-GCM encryption, base64 key decoding, tamper detection,
 * and key validation logic.
 */
import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  EncryptionService,
  createEncryptionService,
} from 'src/services/credentials/encryption.service';

describe('EncryptionService', () => {
  /** Generate a valid base64 key for tests */
  function generateKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  describe('constructor — key decoding', () => {
    it('should accept a base64-encoded 32-byte key and decode it', () => {
      const rawBytes = crypto.randomBytes(32);
      const base64Key = rawBytes.toString('base64');
      const svc = new EncryptionService({ masterKey: base64Key });

      // Verify round-trip works (proves the key was decoded correctly)
      const encrypted = svc.encrypt('test-data');
      expect(svc.decrypt(encrypted)).toBe('test-data');
    });

    it('should fall back to UTF-8 for non-base64 keys (backward compat)', () => {
      // A plain ASCII string that is NOT valid base64 of 32 bytes
      const legacyKey = 'ThisIsALegacyKeyThatIsNotBase64!!';
      const svc = new EncryptionService({ masterKey: legacyKey });

      const encrypted = svc.encrypt('legacy-round-trip');
      expect(svc.decrypt(encrypted)).toBe('legacy-round-trip');
    });

    it('should produce identical results when same base64 key is used twice', () => {
      const key = generateKey();
      const svc1 = new EncryptionService({ masterKey: key });
      const svc2 = new EncryptionService({ masterKey: key });

      const encrypted = svc1.encrypt('shared-secret');
      expect(svc2.decrypt(encrypted)).toBe('shared-secret');
    });

    it('should throw if master key is empty', () => {
      expect(() => new EncryptionService({ masterKey: '' })).toThrow(
        'Master encryption key is required',
      );
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string round-trip', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const plaintext = 'sk-secret-token-12345';

      const encrypted = svc.encrypt(plaintext);
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
      expect(encrypted.salt).toBeTruthy();
      expect(encrypted.algorithm).toBe('aes-256-gcm');

      expect(svc.decrypt(encrypted)).toBe(plaintext);
    });

    it('should encrypt and decrypt an object round-trip', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const obj = { token: 'abc', nested: { key: 'val' } };

      const encrypted = svc.encrypt(obj);
      const decrypted = JSON.parse(svc.decrypt(encrypted));
      expect(decrypted).toEqual(obj);
    });

    it('should produce unique ciphertext for the same plaintext (random IV + salt)', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted1 = svc.encrypt('same-input');
      const encrypted2 = svc.encrypt('same-input');

      // Ciphertext, IV, and salt should differ due to random generation
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it('should fail to decrypt with a different key', () => {
      const svc1 = new EncryptionService({ masterKey: generateKey() });
      const svc2 = new EncryptionService({ masterKey: generateKey() });

      const encrypted = svc1.encrypt('secret');
      expect(() => svc2.decrypt(encrypted)).toThrow('Decryption failed');
    });
  });

  describe('tamper detection (GCM auth tag)', () => {
    it('should reject tampered ciphertext', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted = svc.encrypt('original');

      // Flip a character in the ciphertext
      const tamperedCiphertext =
        encrypted.ciphertext[0] === 'A'
          ? 'B' + encrypted.ciphertext.slice(1)
          : 'A' + encrypted.ciphertext.slice(1);

      expect(() => svc.decrypt({ ...encrypted, ciphertext: tamperedCiphertext })).toThrow(
        'Decryption failed',
      );
    });

    it('should reject tampered auth tag', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted = svc.encrypt('original');

      const badTag = crypto.randomBytes(16).toString('base64');
      expect(() => svc.decrypt({ ...encrypted, authTag: badTag })).toThrow('Decryption failed');
    });

    it('should reject tampered IV', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted = svc.encrypt('original');

      const badIv = crypto.randomBytes(16).toString('base64');
      expect(() => svc.decrypt({ ...encrypted, iv: badIv })).toThrow('Decryption failed');
    });
  });

  describe('encryptObject / decryptObject', () => {
    it('should round-trip an object through JSON-serialized encryption', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const config = {
        accessToken: 'ya29.access',
        refreshToken: '1//refresh',
        clientId: 'client-id',
        clientSecret: 'GOCSPX-secret',
      };

      const encryptedStr = svc.encryptObject(config);
      expect(typeof encryptedStr).toBe('string');

      // The encrypted string should be valid JSON containing ciphertext
      const parsed = JSON.parse(encryptedStr);
      expect(parsed.ciphertext).toBeTruthy();

      const decrypted = svc.decryptObject<typeof config>(encryptedStr);
      expect(decrypted).toEqual(config);
    });
  });

  describe('hash', () => {
    it('should produce consistent SHA-256 hashes', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const hash1 = svc.hash('test-value');
      const hash2 = svc.hash('test-value');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should produce different hashes for different inputs', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      expect(svc.hash('input-a')).not.toBe(svc.hash('input-b'));
    });
  });

  describe('generateToken', () => {
    it('should produce hex tokens of the specified length', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const token = svc.generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should produce unique tokens each call', () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const t1 = svc.generateToken();
      const t2 = svc.generateToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('validateMasterKey (static)', () => {
    it('should reject keys shorter than 32 characters', () => {
      expect(EncryptionService.validateMasterKey('short')).toBe(false);
      expect(EncryptionService.validateMasterKey('a'.repeat(31))).toBe(false);
    });

    it('should accept keys with 3+ character types', () => {
      // Upper + lower + digit + special = 4 types
      expect(EncryptionService.validateMasterKey('Abcdefghijklmnop1234567890!@#$%^')).toBe(true);
    });

    it('should reject keys with fewer than 3 character types', () => {
      // Only lowercase + digits = 2 types
      expect(EncryptionService.validateMasterKey('abcdefghijklmnop1234567890123456')).toBe(false);
    });

    it('should accept generated keys from generateMasterKey()', () => {
      const key = EncryptionService.generateMasterKey();
      expect(EncryptionService.validateMasterKey(key)).toBe(true);
    });
  });

  describe('generateMasterKey (static)', () => {
    it('should produce a base64-encoded 32-byte key', () => {
      const key = EncryptionService.generateMasterKey();
      const decoded = Buffer.from(key, 'base64');
      expect(decoded.length).toBe(32);
    });

    it('should produce unique keys', () => {
      const k1 = EncryptionService.generateMasterKey();
      const k2 = EncryptionService.generateMasterKey();
      expect(k1).not.toBe(k2);
    });
  });

  describe('createEncryptionService (factory)', () => {
    it('should throw when INVECT_ENCRYPTION_KEY is missing', () => {
      const original = process.env.INVECT_ENCRYPTION_KEY;
      delete process.env.INVECT_ENCRYPTION_KEY;
      try {
        expect(() => createEncryptionService()).toThrow('INVECT_ENCRYPTION_KEY');
      } finally {
        if (original) {process.env.INVECT_ENCRYPTION_KEY = original;}
      }
    });

    it('should throw for weak keys', () => {
      const original = process.env.INVECT_ENCRYPTION_KEY;
      process.env.INVECT_ENCRYPTION_KEY = 'weak';
      try {
        expect(() => createEncryptionService()).toThrow('security requirements');
      } finally {
        if (original) {
          process.env.INVECT_ENCRYPTION_KEY = original;
        } else {
          delete process.env.INVECT_ENCRYPTION_KEY;
        }
      }
    });

    it('should succeed with a valid generated key', () => {
      const original = process.env.INVECT_ENCRYPTION_KEY;
      process.env.INVECT_ENCRYPTION_KEY = EncryptionService.generateMasterKey();
      try {
        const svc = createEncryptionService();
        expect(svc.encrypt('test')).toBeTruthy();
      } finally {
        if (original) {
          process.env.INVECT_ENCRYPTION_KEY = original;
        } else {
          delete process.env.INVECT_ENCRYPTION_KEY;
        }
      }
    });
  });
});
