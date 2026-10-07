"use client";
/**
 * Opens the ground viewer (step 17a) from "Stand here" on the map and "See it from here" in December sun.
 * The viewer shows the result the panel shows (the evaluation point's), so it works from a kept result too.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { groundInputs } from "@/lib/render/ground";
import { useScreenItContext } from "@/components/Results/ScreenItContext";
import { GroundViewer } from "./GroundViewer";

const GroundContext = createContext<(() => void) | null>(null);

/** Opens the viewer; null where there's none (the print page) or the shown result has no sun. */
export function useOpenGround(): (() => void) | null {
  const open = useContext(GroundContext);
  const s = useScreenItContext();
  return open && groundInputs(s?.display ?? null) ? open : null;
}

export function GroundProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const s = useScreenItContext();
  const open = useCallback(() => setOpened(true), []);
  const inputs = groundInputs(s?.display ?? null);
  return (
    <GroundContext.Provider value={open}>
      {children}
      {opened && s?.display && inputs && (
        <GroundViewer result={s.display} inputs={inputs} timeZone={timeZone} close={() => setOpened(false)} />
      )}
    </GroundContext.Provider>
  );
}
