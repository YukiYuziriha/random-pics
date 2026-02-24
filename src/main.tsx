import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./theme.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
