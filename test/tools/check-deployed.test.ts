/** `pnpm check:deployed`: what a first visit loads, read from the page and the service worker (owner, #85). */
import { describe, expect, it } from "vitest";
import { HOSPITAL_SNAPSHOT_MARKER } from "@/lib/screen/hospitalsMarker";
import { firstVisitScripts, MARKER } from "../../scripts/check-deployed.mjs";

describe("check:deployed", () => {
  it("looks for the same marker the precache filter uses", () => {
    expect(MARKER).toBe(HOSPITAL_SNAPSHOT_MARKER);
  });

  it("reads the page's scripts and the precache manifest, either chunk layout", () => {
    const html = `<html><script src="/_next/static/chunks/a.js" async></script><script src="/_next/static/chunks/a.js"></script>
      <script>inline()</script><script src="/_next/static/immutable/chunks/b.js"></script></html>`;
    const sw = `var y=[{revision:null,url:"/_next/static/immutable/chunks/c.js"},{revision:null,url:"/_next/static/media/x.css"},{revision:"1",url: "/_next/static/chunks/d.js"}]`;
    expect(firstVisitScripts(html, sw)).toEqual({
      page: ["/_next/static/chunks/a.js", "/_next/static/immutable/chunks/b.js"],
      precache: ["/_next/static/immutable/chunks/c.js", "/_next/static/chunks/d.js"],
    });
  });
});
