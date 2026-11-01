import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// jsdom has no canvas. The landing's canvases check for a null context and
// skip drawing; without this stub jsdom also prints "Not implemented" for
// every one of them.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as HTMLCanvasElement["getContext"];
