import { useCallback, useEffect, useState } from "react";
import Admin from "./Admin";
import Storefront from "./Storefront";
import type { NavigateOptions } from "./share";
import { trackPageview } from "./analytics";

type Route = { productSlug?: string; categorySlug?: string };

function decodeSlug(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/** /p/<slug> opens one product; /c/<slug> opens the collection filtered to a category. */
function readRoute(pathname: string): Route {
  const match = pathname.match(/^\/(p|c)\/([^/]+)\/?$/);
  if (!match) return {};
  const slug = decodeSlug(match[2]);
  return match[1] === "p" ? { productSlug: slug } : { categorySlug: slug };
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // One pageview per route change; admin browsing is not storefront traffic.
  useEffect(() => {
    if (!path.startsWith("/admin")) trackPageview(path);
  }, [path]);

  const navigate = useCallback((nextPath: string, options?: NavigateOptions) => {
    if (options?.replace) window.history.replaceState({}, "", nextPath);
    else window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    if (!options?.keepScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (path.startsWith("/admin")) return <Admin navigate={navigate} />;

  const route = readRoute(path);
  return <Storefront navigate={navigate} initialSlug={route.productSlug} initialCategorySlug={route.categorySlug} />;
}
