import { useEffect, useRef, type ReactNode } from "react";
import { ScrollSmoother, ScrollTrigger, setupGsap } from "../lib/gsapSetup";

/**
 * Wraps the home page in GSAP's ScrollSmoother for inertial scrolling.
 *
 * Scoped to the home page on purpose: ScrollSmoother transforms the content
 * element, which disables `position: sticky` inside it. The blog layout needs a
 * sticky table of contents, so those routes keep native scrolling.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setupGsap();

    if (!wrapper.current || !content.current) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(hover: none)").matches;
    // Touch platforms already have native inertia; overriding it feels worse.
    if (reduce || coarse) return;

    const smoother = ScrollSmoother.create({
      wrapper: wrapper.current,
      content: content.current,
      smooth: 1.15,
      effects: false,
      normalizeScroll: false,
      ignoreMobileResize: true,
    });

    // Child ScrollTriggers are created before this parent effect runs, so their
    // measurements predate the smoother. Re-measure once it is in place.
    ScrollTrigger.refresh();

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);

    return () => {
      window.removeEventListener("load", onLoad);
      smoother.kill();
      ScrollTrigger.refresh();
    };
  }, []);

  return (
    <div id="smooth-wrapper" ref={wrapper}>
      <div id="smooth-content" ref={content}>
        {children}
      </div>
    </div>
  );
}
