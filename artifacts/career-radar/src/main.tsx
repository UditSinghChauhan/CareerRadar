import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function boot() {
  createRoot(document.getElementById("root")!).render(<App />);
}

// When index.html pre-rendered the landing's hero (html.lp-pre), let the
// browser paint it before React starts: requestAnimationFrame runs just
// before the first paint, and the timeout yields until just after it.
if (document.documentElement.classList.contains("lp-pre")) {
  requestAnimationFrame(() => setTimeout(boot, 0));
} else {
  boot();
}
