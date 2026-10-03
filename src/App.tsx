import { Route, Routes } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { CategoryPage } from "./pages/CategoryPage";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

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
          <Route path="/:category" element={<CategoryPage />} />
          <Route path="/:category/:slug" element={<CategoryPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
