import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "virtual:lienotheque-jetons.css";
import "./styles/polices.css";
import "./styles/base.css";
import { App } from "./App.js";
import { brancherLeTraceur } from "./traceur.js";

// Avant le montage : un défaut qui empêche la page de monter doit laisser une trace lui aussi.
brancherLeTraceur();

const racine = document.getElementById("racine");
if (!racine) throw new Error("Point de montage « #racine » introuvable");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
