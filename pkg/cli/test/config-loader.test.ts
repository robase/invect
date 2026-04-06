/**
 * Config Loader Tests
 *
 * Tests the config discovery, loading, and export resolution:
 * - findConfigPath()         — config file discovery across directories
 * - resolveConfigExport()    — handles various module export patterns
 * - loadConfig()             — full config loading with jiti
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findConfigPath, resolveConfigExport } from 'src/utils/config-loader';

// =============================================================================
// findConfigPath()
// =============================================================================

describe('findConfigPath()', () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    existsSyncSpy = vi.spyOn(fs, 'existsSync');
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
  });

  it('should return explicit path when it exists', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      return String(p).endsWith('custom/invect.config.ts');
    });
    const result = findConfigPath('custom/invect.config.ts');
    expect(result).not.toBeNull();
    expect(result!).toContain('custom/invect.config.ts');
  });

  it('should return null when explicit path does not exist', () => {
    existsSyncSpy.mockReturnValue(false);
    expect(findConfigPath('nonexistent/invect.config.ts')).toBeNull();
  });

  it('should find invect.config.ts in cwd', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      // Match the candidate that is `cwd/invect.config.ts` (not in a subdir)
      return s.endsWith('invect.config.ts') && !s.includes('/src/') && !s.includes('/lib/');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('invect.config.ts');
  });

  it('should find invect.config.js in cwd', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      return s.endsWith('invect.config.js') && !s.includes('/src/') && !s.includes('/lib/');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('invect.config.js');
  });

  it('should find invect.config.mjs in cwd', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      return s.endsWith('invect.config.mjs') && !s.includes('/src/') && !s.includes('/lib/');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('invect.config.mjs');
  });

  it('should search src/ directory', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      return String(p).includes('/src/invect.config.ts');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('src/invect.config.ts');
  });

  it('should search lib/ directory', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      return String(p).includes('/lib/invect.config.ts');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('lib/invect.config.ts');
  });

  it('should search config/ directory', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      return String(p).includes('/config/invect.config.ts');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('config/invect.config.ts');
  });

  it('should search utils/ directory', () => {
    existsSyncSpy.mockImplementation((p: fs.PathLike) => {
      return String(p).includes('/utils/invect.config.ts');
    });
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('utils/invect.config.ts');
  });

  it('should return null when no config exists anywhere', () => {
    existsSyncSpy.mockReturnValue(false);
    expect(findConfigPath()).toBeNull();
  });

  it('should prefer cwd over subdirectories', () => {
    // Both cwd and src/ have config — cwd should win (checked first)
    existsSyncSpy.mockReturnValue(true);
    const result = findConfigPath();
    expect(result).not.toBeNull();
    // The cwd candidate is checked before src/
    expect(result!).not.toContain('/src/');
  });

  it('should prefer .ts over .js when both exist in same directory', () => {
    // .ts is checked before .js in CONFIG_FILENAMES
    existsSyncSpy.mockReturnValue(true);
    const result = findConfigPath();
    expect(result).not.toBeNull();
    expect(result!).toContain('.ts');
  });
});

// =============================================================================
// resolveConfigExport()
// =============================================================================

describe('resolveConfigExport()', () => {
  it('should handle export default config', () => {
    const config = { database: { type: 'sqlite' }, plugins: [] };
    const module = { default: config };
    expect(resolveConfigExport(module)).toBe(config);
  });

  it('should handle double-wrapped default exports', () => {
    const config = { database: { type: 'sqlite' }, plugins: [] };
    const module = { default: { default: config } };
    expect(resolveConfigExport(module)).toBe(config);
  });

  it('should handle named export: config', () => {
    const config = { database: { type: 'sqlite' }, plugins: [] };
    const module = { config };
    expect(resolveConfigExport(module)).toBe(config);
  });

  it('should handle named export: invectConfig', () => {
    const config = { database: { type: 'sqlite' }, plugins: [] };
    const module = { invectConfig: config };
    expect(resolveConfigExport(module)).toBe(config);
  });

  it('should handle module that is the config itself (has database)', () => {
    const config = { database: { type: 'sqlite' }, plugins: [] };
    expect(resolveConfigExport(config)).toBe(config);
  });

  it('should handle module that is the config itself (has plugins)', () => {
    const config = { plugins: [{ id: 'test' }] };
    expect(resolveConfigExport(config)).toBe(config);
  });

  it('should return null/undefined as-is', () => {
    expect(resolveConfigExport(null)).toBeNull();
    expect(resolveConfigExport(undefined)).toBeUndefined();
  });

  it('should return primitives as-is', () => {
    expect(resolveConfigExport('string')).toBe('string');
    expect(resolveConfigExport(42)).toBe(42);
    expect(resolveConfigExport(true)).toBe(true);
  });

  it('should return object without recognized keys as-is', () => {
    const obj = { foo: 'bar', baz: 123 };
    expect(resolveConfigExport(obj)).toBe(obj);
  });

  it('should prefer "default" over "config" when both exist', () => {
    const defaultConfig = { database: { type: 'sqlite' } };
    const namedConfig = { database: { type: 'postgresql' } };
    const module = { default: defaultConfig, config: namedConfig };
    expect(resolveConfigExport(module)).toBe(defaultConfig);
  });

  it('should prefer "config" over "invectConfig" when both exist', () => {
    const config1 = { database: { type: 'sqlite' } };
    const config2 = { database: { type: 'postgresql' } };
    const module = { config: config1, invectConfig: config2 };
    expect(resolveConfigExport(module)).toBe(config1);
  });
});
