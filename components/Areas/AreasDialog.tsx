"use client";
/**
 * Where to look, from anywhere (owner, 10/23): the suggestion box in a dialog the menu opens, so it's reachable with a
 * parcel open and from every page, not only on the map's empty search. A native <dialog>, as Help's: Esc closes it,
 * and so does a tap on the backdrop. Show me a parcel here closes it and goes to the map.
 */
import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { AREA_WORDS as W } from "@/lib/areas/words";
import { AreaBox } from "./AreaBox";

export interface AreasDialogHandle {
  open(): void;
}

export const AreasDialog = forwardRef<AreasDialogHandle>(function AreasDialog(_, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Mounted only once opened: the box loads the thirty area files.
  const [shown, setShown] = useState(false);
  const router = useRouter();
  const path = usePathname();
  useImperativeHandle(ref, () => ({
    open() {
      setShown(true);
      if (!dialog.current?.open) dialog.current?.showModal();
    },
  }));
  const close = () => dialog.current?.close();
  return (
    <dialog
      ref={dialog}
      className="help-dialog areas-dialog"
      aria-labelledby="areas-dialog-title"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <header className="help-head">
        <h2 id="areas-dialog-title">{W.onTheMap}</h2>
        <button className="btn secondary small" onClick={close}>
          Close
        </button>
      </header>
      <div className="help-body">
        {shown && (
          <AreaBox
            where="map"
            onShow={() => {
              close();
              if (path !== "/explore") router.push("/explore");
            }}
          />
        )}
      </div>
    </dialog>
  );
});
