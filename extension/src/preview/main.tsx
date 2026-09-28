import React from "react";
import { createRoot } from "react-dom/client";
import { Preview } from "./Preview";
import { LangProvider } from "../shared/i18n";
import "superdoc/style.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LangProvider><Preview /></LangProvider>
  </React.StrictMode>,
);
