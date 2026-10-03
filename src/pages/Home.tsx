import { useEffect } from "react";
import { CardsSection } from "../components/CardsSection";
import { Hero } from "../components/Hero";
import { SiteFooter } from "../components/SiteFooter";
import { SmoothScroll } from "../components/SmoothScroll";
import { site } from "../site.config";

export function Home() {
  useEffect(() => {
    document.title = `${site.name} — ${site.heroLine}`;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return (
    <SmoothScroll>
      <div className="page">
        <Hero />
        <CardsSection />
        <SiteFooter />
      </div>
    </SmoothScroll>
  );
}
