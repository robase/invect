/**
 * Unit tests for EncryptionService
 *
 * Validates AES-256-GCM encryption (WebCrypto), base64 key decoding, tamper
 * detection, key validation, and backward-compat decryption of envelopes
 * encrypted with the legacy PBKDF2-100k KDF (pre-WebCrypto port).
 */
import crypto from 'node:crypto';
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
    it('should accept a base64-encoded 32-byte key and decode it', async () => {
      const rawBytes = crypto.randomBytes(32);
      const base64Key = rawBytes.toString('base64');
      const svc = new EncryptionService({ masterKey: base64Key });

      // Verify round-trip works (proves the key was decoded correctly)
      const encrypted = await svc.encrypt('test-data');
      expect(await svc.decrypt(encrypted)).toBe('test-data');
    });

    it('should fall back to UTF-8 for non-base64 keys (backward compat)', async () => {
      // A plain ASCII string that is NOT valid base64 of 32 bytes
      const legacyKey = 'ThisIsALegacyKeyThatIsNotBase64!!';
      const svc = new EncryptionService({ masterKey: legacyKey });

      const encrypted = await svc.encrypt('legacy-round-trip');
      expect(await svc.decrypt(encrypted)).toBe('legacy-round-trip');
    });

    it('should produce identical results when same base64 key is used twice', async () => {
      const key = generateKey();
      const svc1 = new EncryptionService({ masterKey: key });
      const svc2 = new EncryptionService({ masterKey: key });

      const encrypted = await svc1.encrypt('shared-secret');
      expect(await svc2.decrypt(encrypted)).toBe('shared-secret');
    });

    it('should throw if master key is empty', () => {
      expect(() => new EncryptionService({ masterKey: '' })).toThrow(
        'Master encryption key is required',
      );
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string round-trip with version: 1 envelope', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const plaintext = 'sk-secret-token-12345';

      const encrypted = await svc.encrypt(plaintext);
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
      expect(encrypted.salt).toBeTruthy();
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      // New writes must be tagged with a version so future readers can pick the
      // correct KDF parameters.
      expect(encrypted.version).toBe(1);

      expect(await svc.decrypt(encrypted)).toBe(plaintext);
    });

    it('should encrypt and decrypt an object round-trip', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const obj = { token: 'abc', nested: { key: 'val' } };

      const encrypted = await svc.encrypt(obj);
      const decrypted = JSON.parse(await svc.decrypt(encrypted));
      expect(decrypted).toEqual(obj);
    });

    it('should produce unique ciphertext for the same plaintext (random IV + salt)', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted1 = await svc.encrypt('same-input');
      const encrypted2 = await svc.encrypt('same-input');

      // Ciphertext, IV, and salt should differ due to random generation
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it('should fail to decrypt with a different key', async () => {
      const svc1 = new EncryptionService({ masterKey: generateKey() });
      const svc2 = new EncryptionService({ masterKey: generateKey() });

      const encrypted = await svc1.encrypt('secret');
      await expect(svc2.decrypt(encrypted)).rejects.toThrow('Decryption failed');
    });
  });

  describe('tamper detection (GCM auth tag)', () => {
    it('should reject tampered ciphertext', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted = await svc.encrypt('original');

      // Flip a character in the ciphertext
      const tamperedCiphertext =
        encrypted.ciphertext[0] === 'A'
          ? 'B' + encrypted.ciphertext.slice(1)
          : 'A' + encrypted.ciphertext.slice(1);

      await expect(svc.decrypt({ ...encrypted, ciphertext: tamperedCiphertext })).rejects.toThrow(
        'Decryption failed',
      );
    });

    it('should reject tampered auth tag', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted = await svc.encrypt('original');

      const badTag = crypto.randomBytes(16).toString('base64');
      await expect(svc.decrypt({ ...encrypted, authTag: badTag })).rejects.toThrow(
        'Decryption failed',
      );
    });

    it('should reject tampered IV', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const encrypted = await svc.encrypt('original');

      const badIv = crypto.randomBytes(12).toString('base64');
      await expect(svc.decrypt({ ...encrypted, iv: badIv })).rejects.toThrow('Decryption failed');
    });
  });

  describe('encryptObject / decryptObject', () => {
    it('should round-trip an object through JSON-serialized encryption', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const config = {
        accessToken: 'ya29.access',
        refreshToken: '1//refresh',
        clientId: 'client-id',
        clientSecret: 'GOCSPX-secret',
      };

      const encryptedStr = await svc.encryptObject(config);
      expect(typeof encryptedStr).toBe('string');

      // The encrypted string should be valid JSON containing ciphertext
      const parsed = JSON.parse(encryptedStr);
      expect(parsed.ciphertext).toBeTruthy();

      const decrypted = await svc.decryptObject<typeof config>(encryptedStr);
      expect(decrypted).toEqual(config);
    });
  });

  describe('hash', () => {
    it('should produce consistent SHA-256 hashes', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      const hash1 = await svc.hash('test-value');
      const hash2 = await svc.hash('test-value');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should produce different hashes for different inputs', async () => {
      const svc = new EncryptionService({ masterKey: generateKey() });
      expect(await svc.hash('input-a')).not.toBe(await svc.hash('input-b'));
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
    it('should throw when masterKey is missing', () => {
      expect(() => createEncryptionService(undefined)).toThrow('masterKey is required');
    });

    it('should throw for weak keys', () => {
      expect(() => createEncryptionService('weak')).toThrow('security requirements');
    });

    it('should succeed with a valid generated key', async () => {
      const key = EncryptionService.generateMasterKey();
      const svc = createEncryptionService(key);
      expect(await svc.encrypt('test')).toBeTruthy();
    });
  });

  describe('backward compatibility — legacy PBKDF2-100k envelopes (pre-WebCrypto)', () => {
    /**
     * Recreate an envelope with the original encryption shape:
     *   - PBKDF2-SHA256 with 100,000 iterations (the pre-port iteration count)
     *   - 16-byte IV (the pre-port IV length; AES-GCM accepts arbitrary lengths)
     *   - No `version` field (legacy marker — present means "modern")
     *
     * Encrypting via Node's `crypto.pbkdf2Sync` + `createCipheriv('aes-256-gcm')`
     * here mirrors what the pre-WebCrypto code wrote to the database. The new
     * `decrypt()` implementation must round-trip these envelopes via the legacy
     * code path (auto-selected when `version` is absent).
     */
    function legacyEncrypt(
      masterKey: string,
      plaintext: string,
    ): {
      ciphertext: string;
      iv: string;
      authTag: string;
      salt: string;
      algorithm: string;
    } {
      const decoded = Buffer.from(masterKey, 'base64');
      const masterKeyBytes =
        decoded.length >= 32 && decoded.toString('base64') === masterKey
          ? decoded
          : Buffer.from(masterKey, 'utf-8');

      const salt = crypto.randomBytes(32);
      // Original code used 100k iterations + 16-byte IV.
      const key = crypto.pbkdf2Sync(masterKeyBytes, salt, 100_000, 32, 'sha256');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
      ciphertext += cipher.final('base64');
      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: 'aes-256-gcm',
      };
    }

    it('should decrypt an envelope written by the pre-WebCrypto implementation', async () => {
      const masterKey = EncryptionService.generateMasterKey();
      const plaintext = 'pre-port-credential-payload';

      // Envelope built with the OLD code path (100k iterations, no `version`).
      const legacyEnvelope = legacyEncrypt(masterKey, plaintext);
      // Sanity check — must NOT have a version tag, otherwise the new code
      // would route to the modern (600k-iteration) path and the test would
      // pass for the wrong reason.
      expect((legacyEnvelope as { version?: number }).version).toBeUndefined();

      const svc = new EncryptionService({ masterKey });
      const decrypted = await svc.decrypt(legacyEnvelope);
      expect(decrypted).toBe(plaintext);
    });

    it('should round-trip via decryptObject for legacy envelope strings', async () => {
      const masterKey = EncryptionService.generateMasterKey();
      const payload = { secret: 'old-format', expires: 1234567890 };

      const legacyEnvelope = legacyEncrypt(masterKey, JSON.stringify(payload));
      const legacyEnvelopeStr = JSON.stringify(legacyEnvelope);

      const svc = new EncryptionService({ masterKey });
      const decoded = await svc.decryptObject<typeof payload>(legacyEnvelopeStr);
      expect(decoded).toEqual(payload);
    });

    it('should fail to decrypt a legacy envelope with the wrong key', async () => {
      const correctKey = EncryptionService.generateMasterKey();
      const wrongKey = EncryptionService.generateMasterKey();

      const legacyEnvelope = legacyEncrypt(correctKey, 'sensitive');

      const svc = new EncryptionService({ masterKey: wrongKey });
      await expect(svc.decrypt(legacyEnvelope)).rejects.toThrow('Decryption failed');
    });
  });

  describe('decryptLegacy() — scrypt KDF shim', () => {
    it('should round-trip a scrypt-encrypted envelope via the Node-only fallback', async () => {
      // Build an envelope with scrypt KDF (the hypothetical pre-PBKDF2 format).
      // We construct it inline using node:crypto so the test does not depend
      // on the prior implementation existing in the repository.
      const masterKey = EncryptionService.generateMasterKey();
      const plaintext = 'scrypt-era-credential';

      const masterKeyBytes = Buffer.from(masterKey, 'base64');
      const salt = crypto.randomBytes(32);
      const key = crypto.scryptSync(masterKeyBytes, salt, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
      ciphertext += cipher.final('base64');
      const authTag = cipher.getAuthTag();

      const scryptEnvelope = {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: 'aes-256-gcm',
      };

      const svc = new EncryptionService({ masterKey });
      const decrypted = await svc.decryptLegacy(scryptEnvelope);
      expect(decrypted).toBe(plaintext);
    });
  });
});
