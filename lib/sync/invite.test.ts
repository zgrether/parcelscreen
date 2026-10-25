/**
 * Invite someone (UX part 2 PR 5b): the token seals the code, and only that token opens it; the server keeps the
 * token's hash, used once, within INVITE_DAYS.
 */
import { describe, expect, it } from "vitest";
import { MemorySyncStore } from "./store";
import { generateCode, spaceKeyOf } from "./code";
import { INVITE_DAYS, inviteKeyOf, inviteLink, newInviteToken, sealCode, unsealCode } from "./invite";
import { CODE_HEADER } from "./wire";
import { handleCreateInvite, handleRedeemInvite } from "../server/syncRoutes";

describe("sealing the code", () => {
  it("the token opens what it sealed; another token doesn't", async () => {
    const code = generateCode();
    const token = newInviteToken();
    const sealed = await sealCode(code, token);
    expect(sealed).not.toContain(code);
    expect(await unsealCode(sealed, token)).toBe(code);
    expect(await unsealCode(sealed, newInviteToken())).toBeNull();
    expect(await unsealCode("nonsense", token)).toBeNull();
  });

  it("keys the invite by a hash, never the token, and puts the token in the fragment", async () => {
    const token = newInviteToken();
    expect(await inviteKeyOf(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(await inviteKeyOf(token)).not.toBe(await spaceKeyOf(token));
    expect(inviteLink("https://x.example", token)).toBe(`https://x.example/join#${token}`);
  });
});

describe("the invite routes", () => {
  const post = (path: string, body: unknown, code?: string) =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(code ? { [CODE_HEADER]: code } : {}) },
      body: JSON.stringify(body),
    });

  it("keep an invite for the space's code holder, and give its sealed code once", async () => {
    let now = Date.parse("2026-10-25T00:00:00Z");
    const store = new MemorySyncStore(() => now);
    const code = generateCode();
    await store.createSpace(await spaceKeyOf(code));
    const token = await inviteKeyOf(newInviteToken());

    // Without the space's code, or a body that isn't one, nothing is kept.
    expect((await handleCreateInvite(post("/api/sync/invite", { token, sealed: "a.b" }), store)).status).toBe(
      404,
    );
    expect((await handleCreateInvite(post("/api/sync/invite", { token: "x" }, code), store)).status).toBe(
      400,
    );
    expect(
      (await handleCreateInvite(post("/api/sync/invite", { token, sealed: "a.b" }, code), store)).status,
    ).toBe(201);

    const first = await handleRedeemInvite(post("/api/sync/invite/redeem", { token }), store);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ sealed: "a.b" });
    // Used: the second open gets nothing.
    expect((await handleRedeemInvite(post("/api/sync/invite/redeem", { token }), store)).status).toBe(410);

    // Too old: past INVITE_DAYS, nothing.
    const old = await inviteKeyOf(newInviteToken());
    await handleCreateInvite(post("/api/sync/invite", { token: old, sealed: "c.d" }, code), store);
    now += INVITE_DAYS * 86_400_000 + 1;
    expect((await handleRedeemInvite(post("/api/sync/invite/redeem", { token: old }), store)).status).toBe(
      410,
    );
    // Never made: the same answer.
    const never = await inviteKeyOf(newInviteToken());
    expect((await handleRedeemInvite(post("/api/sync/invite/redeem", { token: never }), store)).status).toBe(
      410,
    );
  });
});
