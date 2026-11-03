import { useEffect, type RefObject } from "react";

let tile: string | null = null;

/**
 * Film grain: one 128px tile of random greys, made once on a canvas and set
 * as a CSS variable, so the stage costs no image request. Shown at 3%.
 */
export function useGrain(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!tile) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tile = `url(${c.toDataURL("image/png")})`;
    }
    el.style.setProperty("--lp-grain", tile);
  }, [root]);
}
