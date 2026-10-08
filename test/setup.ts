// Tests are offline by construction: any code path that reaches the real network fails loudly.
// Pipeline tests inject a replay fetch (test/support/replayFetch.ts) instead.
//
// The one exception is `pnpm record:port` (test/tools/record-port.test.ts), which records the requests only the
// port makes: it takes the real fetch from under this registered symbol. Nothing else reads it.
(globalThis as unknown as Record<symbol, unknown>)[Symbol.for("parcelscreen.liveFetch")] = globalThis.fetch;
globalThis.fetch = (input: string | URL | Request) => {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.reject(new Error(`Network access in tests is not allowed: ${url}`));
};
