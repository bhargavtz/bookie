import { describe, expect, it } from "vitest";
import { canTilt, computeTilt } from "@/components/ui/tilt";

describe("computeTilt", () => {
  const box = { width: 200, height: 300 };

  it.each([
    ["centre is flat", { x: 100, y: 150 }, { rotateX: 0, rotateY: 0 }],
    ["top-left corner tilts to the negative corner", { x: 0, y: 0 }, { rotateX: 7, rotateY: -7 }],
    ["bottom-right corner tilts to the opposite corner", { x: 200, y: 300 }, { rotateX: -7, rotateY: 7 }],
    ["top-right corner", { x: 200, y: 0 }, { rotateX: 7, rotateY: 7 }],
    ["pointer outside the box is clamped", { x: -500, y: 900 }, { rotateX: -7, rotateY: -7 }],
  ])("%s", (_name, pointer, expected) => {
    expect(computeTilt(pointer, box, 7)).toEqual(expected);
  });

  it("never returns negative zero", () => {
    const rotation = computeTilt({ x: 100, y: 150 }, box, 7);
    expect(Object.is(rotation.rotateX, -0)).toBe(false);
    expect(Object.is(rotation.rotateY, -0)).toBe(false);
  });

  it("rounds to two decimals", () => {
    // x: 33/200 -> -0.67 * 7 = -4.69; y: 17/300 -> -0.8867 * 7 inverted = 6.2067
    const rotation = computeTilt({ x: 33, y: 17 }, box, 7);
    expect(rotation.rotateY).toBe(-4.69);
    expect(rotation.rotateX).toBe(6.21);
  });

  it("stays flat for a zero-sized box", () => {
    expect(computeTilt({ x: 10, y: 10 }, { width: 0, height: 300 }, 7)).toEqual({ rotateX: 0, rotateY: 0 });
    expect(computeTilt({ x: 10, y: 10 }, { width: 200, height: 0 }, 7)).toEqual({ rotateX: 0, rotateY: 0 });
  });
});

describe("canTilt", () => {
  it.each([
    ["mouse on a fine pointer", { pointerType: "mouse", finePointer: true, reducedMotion: false }, true],
    ["pen on a fine pointer", { pointerType: "pen", finePointer: true, reducedMotion: false }, true],
    ["touch is always excluded", { pointerType: "touch", finePointer: true, reducedMotion: false }, false],
    ["coarse pointer is excluded", { pointerType: "mouse", finePointer: false, reducedMotion: false }, false],
    ["reduced motion is excluded", { pointerType: "mouse", finePointer: true, reducedMotion: true }, false],
  ])("%s", (_name, environment, expected) => {
    expect(canTilt(environment)).toBe(expected);
  });
});
