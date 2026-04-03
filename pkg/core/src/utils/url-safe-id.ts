const DEFAULT_URL_SAFE_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_' as const;

interface UrlSafeIdGeneratorOptions {
  alphabet?: string;
  size?: number;
}

type UrlSafeIdGenerator = (length?: number) => string;

/**
 * Returns a function that generates URL-safe IDs using a fixed alphabet/size.
 */
export function createUrlSafeIdGenerator(
  options: UrlSafeIdGeneratorOptions = {},
): UrlSafeIdGenerator {
  const alphabet = options.alphabet ?? DEFAULT_URL_SAFE_ALPHABET;
  const defaultSize = options.size ?? 21;
  validateAlphabet(alphabet);

  return (length: number = defaultSize) => generateUrlSafeId(length, alphabet);
}

/**
 * Generates a URL-safe identifier using secure randomness.
 */
function generateUrlSafeId(length = 21, alphabet: string = DEFAULT_URL_SAFE_ALPHABET): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('ID length must be a positive integer');
  }

  validateAlphabet(alphabet);

  const alphabetLength = alphabet.length;
  const maxMultiple = Math.floor(256 / alphabetLength) * alphabetLength;
  const fallbackToModulo = maxMultiple === 0;
  const characters: string[] = [];

  while (characters.length < length) {
    const randomValues = secureRandomBytes(length - characters.length);

    for (let i = 0; i < randomValues.length && characters.length < length; i += 1) {
      const value = randomValues[i];

      if (!fallbackToModulo && value >= maxMultiple) {
        continue; // Drop values that would bias the distribution
      }

      const charIndex = value % alphabetLength;
      characters.push(alphabet[charIndex]);
    }
  }

  return characters.join('');
}

function secureRandomBytes(size: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const array = new Uint8Array(size);
    globalThis.crypto.getRandomValues(array);
    return array;
  }

  return pseudoRandomBytes(size);
}

function pseudoRandomBytes(size: number): Uint8Array {
  const array = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

function validateAlphabet(alphabet: string): void {
  if (!alphabet || typeof alphabet !== 'string' || alphabet.length === 0) {
    throw new Error('Alphabet must be a non-empty string');
  }
}
