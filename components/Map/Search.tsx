"use client";
/** Coordinates search on the map (was in the panel's "Find the parcel"): paste "lat, lon" and Go (or Enter). */
import { useState } from "react";
import { useExplore } from "@/components/Explore/useExploreController";

export function Search() {
  const ctl = useExplore();
  const [text, setText] = useState("");
  return (
    <form
      className="map-search"
      onSubmit={(e) => {
        e.preventDefault();
        ctl.goTo(text);
      }}
    >
      <input
        type="text"
        className="field"
        placeholder="Paste lat, lon"
        aria-label="Latitude, longitude"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn small">
        Go
      </button>
    </form>
  );
}
