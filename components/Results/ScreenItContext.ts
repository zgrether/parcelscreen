"use client";
/**
 * The open parcel's screen (useScreenIt, owned by ExploreShell), for what the map draws from it: the surface
 * image and its button, the Analysis rows in Info › Layers, and step 15's pins and fan.
 */
import { createContext, useContext } from "react";
import type { ScreenIt } from "./panel/ScreenIt";

export const ScreenItContext = createContext<ScreenIt | null>(null);

export const useScreenItContext = (): ScreenIt | null => useContext(ScreenItContext);
