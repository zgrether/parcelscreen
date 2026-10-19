/**
 * A synced space's code (step 5, docs/plans/step-5-sync.md §1): 130 random bits, written as 26 characters of Crockford
 * base32 in groups of five. Anyone who has it can read and change the space, so it travels only in a URL fragment and
 * a request header, and the server keys rows by its SHA-256 (`spaceKeyOf`), never by the code itself.
 */

/** Crockford's base32: no I, L, O or U, so nothing is misread. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 26;
const CODE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** A new code from `crypto.getRandomValues`: 26 characters × 5 bits = 130 bits. */
export function generateCode(
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

/**
 * What was typed or pasted, as a code, or null. Spaces and dashes are ignored, letters are read in either case, and
 * Crockford's look-alikes are read as the digits they stand for (I and L as 1, O as 0).
 */
export function normalizeCode(input: string): string | null {
  const s = input.replace(/[\s-]/g, "").toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
  return CODE.test(s) ? s : null;
}

/** The code as shown: groups of five, `7KQ2M-X9D4F-…`. */
export const groupCode = (code: string): string => code.match(/.{1,5}/g)!.join("-");

/** The space's key on the server: the code's SHA-256, in hex. */
export async function spaceKeyOf(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
