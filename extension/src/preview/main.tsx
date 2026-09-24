import React from "react";
import { createRoot } from "react-dom/client";
import { Preview } from "./Preview";
import "superdoc/style.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
