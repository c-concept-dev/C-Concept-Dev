// La même question, posée au **vrai** Safari.
//
// Le WebKit de Playwright est en avance sur le Safari livré, et c'est le second qui compte,
// puisque c'est celui de la plateforme de référence. On le pilote donc par safaridriver.
//
// Ce qui est mesurable sans personne devant l'écran : la présence de l'API et la disponibilité
// d'un authentificateur de plateforme. La cérémonie elle-même ouvre la feuille de Touch ID et
// attend un doigt sur le capteur — elle ne peut pas être menée sans quelqu'un, et ce banc ne
// l'appelle pas plutôt que de faire croire qu'il l'a mesurée.
//
// Lancement — voir bancs/README.md. Hors bac à sable, et safaridriver doit être autorisé une
// fois pour toutes (« safaridriver --enable »).

import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = 8787;
const PILOTE = 4445;

const PAGE = `<!doctype html><meta charset="utf-8"><title>Mesure</title><body>prête</body>`;

const SONDE = `
  const laReponse = typeof AuthenticatorAttestationResponse !== "undefined";
  return JSON.stringify({
    contexteSur: window.isSecureContext,
    origine: location.origin,
    credentials: typeof navigator.credentials?.create === "function",
    attestationResponse: laReponse,
    getPublicKey: laReponse && typeof AuthenticatorAttestationResponse.prototype.getPublicKey === "function",
    getPublicKeyAlgorithm: laReponse && typeof AuthenticatorAttestationResponse.prototype.getPublicKeyAlgorithm === "function",
    getAuthenticatorData: laReponse && typeof AuthenticatorAttestationResponse.prototype.getAuthenticatorData === "function",
    conditionnelle: typeof PublicKeyCredential !== "undefined" &&
      typeof PublicKeyCredential.isConditionalMediationAvailable === "function",
    versionAnnoncee: navigator.userAgent,
  });
`;

const serveur = createServer((_, rep) => {
  rep.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  rep.end(PAGE);
});
await new Promise((ok, non) => {
  serveur.on("error", non);
  serveur.listen(PORT, "127.0.0.1", ok);
});
console.log(`page servie sur http://localhost:${PORT}`);

const pilote = spawn("/usr/bin/safaridriver", ["-p", String(PILOTE)], { stdio: ["ignore", "pipe", "pipe"] });
pilote.stderr.on("data", (d) => console.log(`pilote : ${d}`.trim()));

const appeler = async (methode, chemin, corps) => {
  const rep = await fetch(`http://127.0.0.1:${PILOTE}${chemin}`, {
    method: methode,
    headers: { "content-type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  return { statut: rep.status, corps: await rep.json().catch(() => null) };
};

// Le pilote met un instant à écouter.
for (let essai = 0; essai < 40; essai += 1) {
  try {
    const r = await fetch(`http://127.0.0.1:${PILOTE}/status`);
    if (r.ok) break;
  } catch {
    await new Promise((ok) => setTimeout(ok, 250));
  }
}

let session = null;
try {
  const ouverte = await appeler("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "safari" } },
  });
  if (ouverte.corps?.value?.sessionId === undefined) {
    console.log("SESSION REFUSÉE :", JSON.stringify(ouverte, null, 2));
  } else {
    session = ouverte.corps.value.sessionId;
    const c = ouverte.corps.value.capabilities;
    console.log(`Safari ${c.browserVersion} (build ${c["safari:platformBuildVersion"]}) piloté`);

    await appeler("POST", `/session/${session}/url`, { url: `http://localhost:${PORT}/mesure` });
    const sonde = await appeler("POST", `/session/${session}/execute/sync`, { script: SONDE, args: [] });
    console.log("SONDE :", sonde.corps?.value ?? JSON.stringify(sonde));

    // La disponibilité d'un authentificateur de plateforme est une promesse : script asynchrone.
    const plateforme = await appeler("POST", `/session/${session}/execute/async`, {
      script: `const fini = arguments[0];
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          .then((v) => fini(String(v))).catch((e) => fini("erreur : " + e.message));`,
      args: [],
    });
    console.log("AUTHENTIFICATEUR DE PLATEFORME :", plateforme.corps?.value ?? JSON.stringify(plateforme));
  }
} finally {
  if (session !== null) await appeler("DELETE", `/session/${session}`);
  pilote.kill();
  serveur.close();
}
