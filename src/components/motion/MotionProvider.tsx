"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Global motion layer: smooth scrolling (Lenis) synced with GSAP ScrollTrigger,
 * plus scroll-triggered reveal animations for sections and cards. Honours
 * prefers-reduced-motion by disabling everything.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let lenis: Lenis | null = null;
    const onTick = (time: number) => {
      lenis?.raf(time * 1000);
    };

    if (!reduced) {
      lenis = new Lenis({
        duration: 1.15,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(onTick);
      gsap.ticker.lagSmoothing(0);
    }

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("main section, main > div, .reveal"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const siblings = Array.from(el.parentElement?.children ?? []);
          const idx = Math.min(siblings.indexOf(el), 6);
          el.style.transitionDelay = `${idx * 70}ms`;
          el.classList.add("is-visible");
          observer.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );

    targets.forEach((el) => {
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
      if (lenis) lenis.destroy();
      gsap.ticker.remove(onTick);
    };
  }, []);

  return <>{children}</>;
}