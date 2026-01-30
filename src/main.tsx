import { createRoot } from "react-dom/client";
import App from "./App.tsx";

Neutralino.init();
Neutralino.events.on("ready", () => {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
});

