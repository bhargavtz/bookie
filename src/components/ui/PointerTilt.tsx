"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { canTilt, computeTilt } from "./tilt";

/**
 * Wraps children in a pointer-driven tilt. Writes --tilt-x and --tilt-y on the
 * element; CSS turns them into a 3D rotation. Does nothing for touch input or
 * when reduced motion is requested, and resets to flat on leave.
 */
export function PointerTilt({
  children,
  className,
  maxDegrees = 7,
}: {
  children: ReactNode;
  className?: string;
  maxDegrees?: number;
}) {
  function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const enabled = canTilt({
      pointerType: event.pointerType,
      finePointer: window.matchMedia("(pointer: fine)").matches,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    if (!enabled) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const rotation = computeTilt(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      maxDegrees,
    );
    element.style.setProperty("--tilt-x", String(rotation.rotateX));
    element.style.setProperty("--tilt-y", String(rotation.rotateY));
  }

  function handleLeave(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--tilt-x", "0");
    event.currentTarget.style.setProperty("--tilt-y", "0");
  }

  return (
    <div className={className} onPointerMove={handleMove} onPointerLeave={handleLeave}>
      {children}
    </div>
  );
}
