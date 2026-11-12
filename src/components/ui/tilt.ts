/** Pure pointer-tilt maths for PointerTilt. No DOM access, so it is unit-testable. */

export type PointerPosition = { x: number; y: number };
export type BoxSize = { width: number; height: number };
export type TiltRotation = { rotateX: number; rotateY: number };
export type TiltEnvironment = {
  /** PointerEvent.pointerType: "mouse", "pen" or "touch". */
  pointerType: string;
  /** matchMedia("(pointer: fine)"). */
  finePointer: boolean;
  /** matchMedia("(prefers-reduced-motion: reduce)"). */
  reducedMotion: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundDegrees(value: number): number {
  // `|| 0` turns -0 into 0 so the CSS custom property never reads "-0".
  return Math.round(value * 100) / 100 || 0;
}

/**
 * Maps a pointer position inside an element to a rotation in degrees.
 * The centre is flat; each edge tilts by at most `maxDegrees`. Pointer
 * positions outside the box are clamped, and a zero-sized box stays flat.
 */
export function computeTilt(
  pointer: PointerPosition,
  box: BoxSize,
  maxDegrees: number,
): TiltRotation {
  if (box.width <= 0 || box.height <= 0) {
    return { rotateX: 0, rotateY: 0 };
  }

  const normalisedX = clamp(pointer.x / box.width, 0, 1) * 2 - 1;
  const normalisedY = clamp(pointer.y / box.height, 0, 1) * 2 - 1;

  return {
    // Moving the pointer down tips the top edge away, so the X rotation is inverted.
    rotateX: roundDegrees(-normalisedY * maxDegrees),
    rotateY: roundDegrees(normalisedX * maxDegrees),
  };
}

/**
 * Tilt follows the pointer only for mouse and pen users on fine pointers, and
 * never when the user asks for reduced motion. Touch is excluded: a finger
 * should not drive a 3D transform.
 */
export function canTilt(environment: TiltEnvironment): boolean {
  return environment.pointerType !== "touch" && environment.finePointer && !environment.reducedMotion;
}
