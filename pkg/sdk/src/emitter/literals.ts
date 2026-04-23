/**
 * TS literal formatting.
 *
 * `toTsLiteral` serializes JS values to TypeScript object/array literal source
 * — the same as `JSON.stringify(v, null, 2)` except object keys that are valid
 * JS identifiers are emitted unquoted and each item gets a trailing comma.
 * Keeps the emitter output diff-friendly.
 */

const VALID_JS_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export function isValidJsIdent(s: string): boolean {
  return VALID_JS_IDENT.test(s);
}

export function toTsLiteral(value: unknown, depth = 0): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const childPad = '  '.repeat(depth + 1);
    const closePad = '  '.repeat(depth);
    const items = value.map((v) => `${childPad}${toTsLiteral(v, depth + 1)},`);
    return `[\n${items.join('\n')}\n${closePad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) {
      return '{}';
    }
    const childPad = '  '.repeat(depth + 1);
    const closePad = '  '.repeat(depth);
    const items = entries.map(([k, v]) => {
      const keyStr = VALID_JS_IDENT.test(k) ? k : JSON.stringify(k);
      return `${childPad}${keyStr}: ${toTsLiteral(v, depth + 1)},`;
    });
    return `{\n${items.join('\n')}\n${closePad}}`;
  }
  return JSON.stringify(value);
}

export function indent(block: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}
