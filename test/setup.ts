// Tests are offline by construction: any code path that reaches the real network fails loudly.
// Pipeline tests inject a replay fetch (test/support/replayFetch.ts) instead.
globalThis.fetch = (input: string | URL | Request) => {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.reject(new Error(`Network access in tests is not allowed: ${url}`));
};
