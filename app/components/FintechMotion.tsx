"use client";
import { useEffect } from "react";

/** Progressive enhancement: never hides data before JS loads. */
export default function FintechMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || !("IntersectionObserver" in window)) return;
    const targets = Array.from(document.querySelectorAll<HTMLElement>(
      ".sector-rotation-member, .morning-brief, .market-analysis-wide"
    ));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.classList.add("fintech-motion-visible");
        observer.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
    targets.forEach((el) => {
      // Animate only elements initially below the viewport; no invisible first paint.
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add("fintech-motion-ready");
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
