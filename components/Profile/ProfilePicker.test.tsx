import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { bootProfiles, resetProfilesForTests } from "@/lib/client/profiles";
import { memoryProfileStorage } from "@/lib/client/profileStore";
import { ProfilePicker } from "./ProfilePicker";

afterEach(resetProfilesForTests);

describe("the profile picker (step 1, PR 5b)", () => {
  it("shows the current profile's name on the Switch profile button, with the list closed", async () => {
    await bootProfiles({ storage: memoryProfileStorage(), ls: null });
    const html = renderToStaticMarkup(<ProfilePicker />);
    expect(html).toContain('aria-label="Switch profile"');
    expect(html).toContain("Profile 1");
    expect(html).not.toContain("Add a profile");
    expect(html).not.toContain("refused storage");
  });
});
