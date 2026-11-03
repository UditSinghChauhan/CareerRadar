import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// jsdom has no canvas. The landing's canvases check for a null context and
// skip drawing; without this stub jsdom also prints "Not implemented" for
// every one of them.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as HTMLCanvasElement["getContext"];

// jsdom has no IntersectionObserver or ResizeObserver. The landing's reveals
// and loops only need them to exist; nothing in a unit test scrolls.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??=
  NoopObserver as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
