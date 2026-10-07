import { Route, Routes, useParams } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { CategoryPage } from "./pages/CategoryPage";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { NotePage, OthersIndex } from "./pages/NotePage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { SeriesPage } from "./pages/SeriesPage";
import { StubPage } from "./pages/StubPage";
import {
  getSeries,
  isCategoryId,
  others,
  roadmap,
  skills,
} from "./site.config";

/**
 * `/<category>/<second>` has two meanings that share one shape: the second
 * segment is either a standalone article's slug or a series' slug.
 *
 * Declared series win. This is a lookup rather than a guess because the
 * content compiler refuses to build when an article slug collides with a
 * series slug in the same category, so at most one of the two can exist.
 */
function CategoryChild() {
  const { category, slug } = useParams();
  const meta = isCategoryId(category) ? getSeries(category, slug) : undefined;
  return meta ? <SeriesPage meta={meta} /> : <CategoryPage />;
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <TopNav />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Declared before the category routes for readability. Router
              ranking would pick the static segment over `/:category` anyway,
              but `others` is not a CategoryId, so leaving it to fall through
              would land on NotFound. */}
          <Route path={`/${others.slug}`} element={<OthersIndex />} />
          <Route path={`/${others.slug}/:slug`} element={<NotePage />} />

          {/* Declared but not built. Static segments outrank `/:category`, so
              these resolve here rather than falling through to a NotFound. */}
          <Route path={`/${skills.slug}`} element={<StubPage meta={skills} />} />
          <Route path={`/${roadmap.slug}`} element={<RoadmapPage />} />

          <Route path="/:category" element={<CategoryPage />} />
          <Route path="/:category/:slug" element={<CategoryChild />} />
          <Route path="/:category/:series/:slug" element={<CategoryPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
