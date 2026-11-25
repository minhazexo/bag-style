import { useEffect, useState } from "react";
import Admin from "./Admin";
import Storefront from "./Storefront";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (nextPath: string) => {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return path.startsWith("/admin")
    ? <Admin navigate={navigate} />
    : <Storefront navigate={navigate} />;
}