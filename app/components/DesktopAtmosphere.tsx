"use client";

import { useEffect, useRef } from "react";

/** Decorative motion stays outside the dashboard's layout and chart coordinates. */
export default function DesktopAtmosphere() {
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1051px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose = () => {};

    const configure = () => {
      dispose();
      if (!desktop.matches || reduced.matches || !backdrop.current) return;
      const layers = Array.from(backdrop.current.children) as HTMLElement[];
      let frame = 0;
      const paint = () => {
        frame = 0;
        // Bounded displacement keeps the fixed layers covered even on long pages.
        const depth = 520 * window.scrollY / (window.scrollY + 1800);
        layers.forEach((layer, i) => {
          layer.style.transform = `translate3d(0, ${-depth * [0.28, 0.65, 1][i]}px, 0)`;
        });
      };
      const schedule = () => {
        if (!document.hidden && !frame) frame = requestAnimationFrame(paint);
      };
      paint();
      window.addEventListener("scroll", schedule, { passive: true });
      document.addEventListener("visibilitychange", schedule);

      // Only small, non-chart surfaces reveal. The server-rendered default is visible.
      const targets = Array.from(document.querySelectorAll<HTMLElement>(
        ".site-shell .section-heading, .site-shell .stat-card, .site-shell .news-card, .site-shell .sector-radar-panel"
      ));
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("reveal-pending");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0, rootMargin: "0px 0px -24px 0px" });
      targets.forEach(target => {
        // Keep initial viewport and anchor destinations immediately readable.
        if (target.getBoundingClientRect().top > window.innerHeight) {
          target.classList.add("reveal-surface", "reveal-pending");
          observer.observe(target);
        }
      });
      const showFocused = (event: FocusEvent) => {
        (event.target as HTMLElement).closest(".reveal-pending")?.classList.remove("reveal-pending");
      };
      document.addEventListener("focusin", showFocused);
      dispose = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("scroll", schedule);
        document.removeEventListener("visibilitychange", schedule);
        document.removeEventListener("focusin", showFocused);
        observer.disconnect();
        targets.forEach(target => target.classList.remove("reveal-surface", "reveal-pending"));
        layers.forEach(layer => layer.style.removeProperty("transform"));
      };
    };
    configure();
    desktop.addEventListener("change", configure);
    reduced.addEventListener("change", configure);
    return () => {
      dispose();
      desktop.removeEventListener("change", configure);
      reduced.removeEventListener("change", configure);
    };
  }, []);

  return <div ref={backdrop} className="desktop-atmosphere" aria-hidden="true">
    <div className="atmosphere-depth" />
    <div className="atmosphere-grid" />
    <div className="atmosphere-gold" />
  </div>;
}
