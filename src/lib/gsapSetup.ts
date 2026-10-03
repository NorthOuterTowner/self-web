import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/** Registers GSAP plugins once per page load. */
export function setupGsap(): void {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, ScrollToPlugin);
  // Swiss motion: decisive, no bounce.
  gsap.defaults({ ease: "power3.out", duration: 0.9 });
}

export { gsap, ScrollSmoother, ScrollToPlugin, ScrollTrigger };
