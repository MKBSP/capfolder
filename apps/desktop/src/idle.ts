import { useEffect } from "react";

/** Calls onIdle after `minutes` without keyboard or pointer input. 0 = never. */
export function useIdle(minutes: number, onIdle: () => void) {
  useEffect(() => {
    if (!minutes) return;
    let t = setTimeout(onIdle, minutes * 60_000);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(onIdle, minutes * 60_000);
    };
    const events = ["mousemove", "keydown", "pointerdown", "wheel"];
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      clearTimeout(t);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [minutes, onIdle]);
}
