/**
 * Polling's timer (step 6b, poll.ts): every 30 s while visible and online, none while hidden or offline, 2 minutes after
 * 3 failures in a row, and a full interval again after any fetch (a focus or tab-switch fetch resets it).
 */
import { describe, expect, it } from "vitest";
import { BACKOFF_MS, POLL_MS, Poller, type PollEnv } from "./poll";

/** A clock the test moves by hand, and a page whose visibility and network it sets. */
function fakeEnv() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const page = { visible: true, online: true };
  const env: PollEnv = {
    visible: () => page.visible,
    online: () => page.online,
    setTimeout: (run, ms) => {
      const id = next++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout: (id) => void timers.delete(id as number),
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].run();
    }
    now = until;
  };
  return { env, page, advance };
}

/** A poller whose fetch is recorded, and ends (ok or failed) when the test says. */
function setup() {
  const f = fakeEnv();
  const polls: number[] = [];
  let n = 0;
  const poller = new Poller(() => polls.push(++n), f.env);
  return { ...f, poller, polls };
}

describe("polling (step 6b)", () => {
  it("polls every 30 s while visible and online, once each fetch has ended", () => {
    const { poller, polls, advance } = setup();
    poller.start();
    advance(POLL_MS - 1);
    expect(polls).toEqual([]);
    advance(1);
    expect(polls).toEqual([1]);
    // The fetch is out: nothing more is waiting until it ends.
    expect(poller.waiting()).toBe(false);
    poller.fetched(true);
    advance(POLL_MS);
    expect(polls).toEqual([1, 2]);
  });

  it("nothing waits while hidden or offline; shown or online again, a full interval", () => {
    const { poller, polls, page, advance } = setup();
    poller.start();
    advance(10_000);
    page.visible = false;
    poller.changed();
    expect(poller.waiting()).toBe(false);
    advance(5 * POLL_MS);
    expect(polls).toEqual([]);
    page.visible = true;
    poller.changed();
    advance(POLL_MS - 1);
    expect(polls).toEqual([]);
    advance(1);
    expect(polls).toEqual([1]);
    poller.fetched(true);
    page.online = false;
    poller.changed();
    advance(5 * POLL_MS);
    expect(polls).toEqual([1]);
    page.online = true;
    poller.changed();
    advance(POLL_MS);
    expect(polls).toEqual([1, 2]);
  });

  it("a timer that fires while hidden polls nothing", () => {
    const { poller, polls, page, advance } = setup();
    poller.start();
    page.visible = false; // hidden without the event yet
    advance(POLL_MS);
    expect(polls).toEqual([]);
  });

  it("backs off to 2 minutes after 3 failed fetches in a row, and back to 30 s after one succeeds", () => {
    const { poller, polls, advance } = setup();
    poller.start();
    for (let i = 1; i <= 3; i++) {
      advance(POLL_MS);
      expect(polls).toHaveLength(i);
      poller.fetched(false);
    }
    expect(poller.interval()).toBe(BACKOFF_MS);
    advance(BACKOFF_MS - 1);
    expect(polls).toHaveLength(3);
    advance(1);
    expect(polls).toHaveLength(4);
    poller.fetched(true);
    expect(poller.interval()).toBe(POLL_MS);
    advance(POLL_MS);
    expect(polls).toHaveLength(5);
  });

  it("two failures then a success don't back off", () => {
    const { poller } = setup();
    poller.start();
    poller.fetched(false);
    poller.fetched(false);
    poller.fetched(true);
    poller.fetched(false);
    expect(poller.interval()).toBe(POLL_MS);
  });

  it("a fetch from a focus or a tab switch resets the timer, so the two don't double up", () => {
    const { poller, polls, advance } = setup();
    poller.start();
    advance(25_000);
    poller.fetched(true); // the focus fetch ends at 25 s
    advance(POLL_MS - 1);
    expect(polls).toEqual([]);
    advance(1);
    expect(polls).toEqual([1]);
  });

  it("stopped (leaving sync), nothing polls", () => {
    const { poller, polls, advance } = setup();
    poller.start();
    poller.stop();
    poller.fetched(true);
    advance(5 * POLL_MS);
    expect(polls).toEqual([]);
  });
});
