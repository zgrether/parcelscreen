/**
 * Invite someone (UX part 2 PR 5b; the audit's P-8): a one-use link for a person to join the household. The link
 * carries a fresh token, never the space's code. The server keeps only the token's SHA-256 and the code sealed with a
 * key made from the token (AES-GCM), so what it stores opens nothing; redeeming marks the invite used, once, within
 * INVITE_DAYS. The token travels in the URL fragment, which no request sends.
 */
import { generateCode, spaceKeyOf } from "./code";

/** How long an invite can be used. */
export const INVITE_DAYS = 7;

/** A new token: 130 random bits, as a code is. */
export const newInviteToken = (): string => generateCode();

/** What the server keys an invite by: the token's SHA-256, in hex. */
export const inviteKeyOf = (token: string): Promise<string> => spaceKeyOf(`invite:${token}`);

const bytesOf = (s: string) => new TextEncoder().encode(s);
const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFor(token: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", bytesOf(`seal:${token}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** The space's code sealed with the token: "<iv>.<ciphertext>", both base64. */
export async function sealCode(code: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(token), bytesOf(code));
  return `${b64(iv)}.${b64(new Uint8Array(sealed))}`;
}

/** The code back from what the server kept, or null when the token doesn't open it. */
export async function unsealCode(sealed: string, token: string): Promise<string | null> {
  const [iv, body] = sealed.split(".");
  if (!iv || !body) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      await keyFor(token),
      unb64(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** The link a person opens: the token in its fragment. */
export const inviteLink = (origin: string, token: string): string => `${origin}/join#${token}`;
