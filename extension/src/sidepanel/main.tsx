import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LangProvider } from "../shared/i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LangProvider><App /></LangProvider>
  </React.StrictMode>,
);
