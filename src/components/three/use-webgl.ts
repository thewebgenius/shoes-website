"use client";

import { useSyncExternalStore } from "react";

let cached: boolean | undefined;

function detect() {
  if (cached === undefined) {
    try {
      const c = document.createElement("canvas");
      cached = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      cached = false;
    }
  }
  return cached;
}

const subscribe = () => () => {};

/** `null` while server rendering, then whether this browser can draw WebGL. */
export function useWebglSupport(): boolean | null {
  return useSyncExternalStore(subscribe, detect, () => null);
}
