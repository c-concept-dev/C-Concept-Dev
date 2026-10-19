// La cérémonie entière, de la page au registre, sans toucher à la production.
//
// Ce que les tests ne peuvent pas prouver : que la **page** sait parler au **service**. Les deux
// moitiés sont éprouvées séparément — l'une avec un service remplacé, l'autre avec un navigateur
// remplacé — et c'est précisément entre elles que le défaut du 19 octobre vivait : les routes
// d'amorçage exigeaient un jeton qu'aucune page n'a le droit de porter, et tous les tests
// passaient.
//
// Ici : un Worker réel (workerd, bases locales vides), la page réelle servie par lui, un vrai
// navigateur, et un authentificateur virtuel CTAP2 qui tient le rôle du capteur. On amorce, on
// entre, on cherche.
//
// Hors bac à sable — tout navigateur a besoin des services Mach que celui-ci refuse. Voir
// bancs/README.md.

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const exiger = createRequire(import.meta.url);
const { chromium } = exiger(
  exiger.resolve("@playwright/test", { paths: [new URL("../../app/", import.meta.url).pathname] }),
);

const PORT = 8790;
// « localhost » et non « 127.0.0.1 » : les deux font un contexte sûr, mais **une adresse IP ne
// peut pas être un domaine de cérémonie** — WebAuthn l'interdit, et « create() » échoue alors
// par une exception que la page ne peut lire que comme une cérémonie interrompue. Le banc l'a
// trouvé du premier coup.
const BASE = `http://localhost:${PORT}`;
const JETON = "jeton de banc";

const dire = (quoi, comment) => console.log(`${comment ? "  ✓" : "  ✗"} ${quoi}`);
let tenu = true;
const exiger_que = (quoi, vrai) => {
  if (!vrai) tenu = false;
  dire(quoi, vrai);
};

const ICI = new URL("..", import.meta.url).pathname;

const lancer = async (...args) => {
  const enfant = spawn("pnpm", ["exec", "wrangler", ...args], { cwd: ICI, stdio: "ignore" });
  await new Promise((ok) => enfant.on("exit", ok));
};

// **Le banc repart de rien, et avant que le moteur tourne.**
//
// L'état local de « wrangler dev » survit d'une exécution à l'autre : la clé du passage
// précédent refermerait l'amorçage, et le banc échouerait sur un reste au lieu de mesurer.
//
// Et le nettoyage vient **avant** le moteur, non après : deux processus sur la même base locale
// se la disputent, et le moteur redémarre au milieu du banc — « Failed to fetch » sans autre
// explication. Mesuré.
rmSync(new URL("../.wrangler/state/v3/d1", import.meta.url), { recursive: true, force: true });
await lancer("d1", "migrations", "apply", "lienotheque-registre", "--config", "wrangler.toml", "--local");

/** Le Worker, avec ses secrets posés dans l'environnement du processus — jamais dans un fichier. */
const moteur = spawn(
  "pnpm",
  [
    "exec", "wrangler", "dev", "--local", "--config", "wrangler.toml",
    "--port", String(PORT), "--ip", "127.0.0.1",
    "--var", `JETON_ACCES:${JETON}`,
    "--var", "BIBLIOTHEQUE_FACADE:essai",
    "--var", "SECRET_LAISSEZ:secret de banc",
    "--var", `ORIGINE_CEREMONIE:${BASE}`,
    "--var", "DOMAINE_CEREMONIE:localhost",
  ],
  { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] },
);
moteur.stdout.on("data", (d) => {
  if (String(d).includes("Ready on")) console.log("  moteur prêt");
});

const attendre = async () => {
  for (let essai = 0; essai < 90; essai += 1) {
    try {
      const r = await fetch(`${BASE}/sante`);
      if (r.ok) return true;
    } catch {
      await new Promise((ok) => setTimeout(ok, 1000));
    }
  }
  return false;
};

try {
  if (!(await attendre())) {
    console.log("  ✗ le moteur n'a pas démarré");
    process.exit(1);
  }

  // ── 1. L'invitation, par le jeton. C'est le seul appel qui l'exige. ────────
  const invite = await fetch(`${BASE}/amorce/defi`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": JETON },
    body: JSON.stringify({ nom: "Christophe" }),
  });
  exiger_que("le jeton émet une invitation", invite.ok);
  if (!invite.ok) {
    console.log(`     ${invite.status} ${await invite.text()}`);
    process.exit(1);
  }
  const { defi } = await invite.json();

  exiger_que(
    "sans jeton, aucune invitation",
    (await fetch(`${BASE}/amorce/defi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nom: "Quelqu'un" }),
    })).status === 401,
  );

  // ── 2. La page mène la cérémonie, avec un authentificateur virtuel ────────
  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({ baseURL: BASE });
  const page = await contexte.newPage();

  const cdp = await contexte.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const refus = [];
  page.on("console", (message) => {
    if (message.type() === "error") refus.push(message.text());
  });

  await page.goto(`/#entrer/invitation=${defi}`);
  await page.waitForSelector(".ln-entrer", { timeout: 15000 });
  exiger_que("la page d'entrée s'affiche, servie par le Worker", true);

  await page.getByLabel(/nom de cet appareil/i).fill("Portable du banc");
  await page.getByRole("button", { name: /ma clé/i }).click();

  // Le refus, s'il y en a un, paraît dans la zone d'annonce.
  await page.waitForFunction(
    () => {
      const zone = document.querySelector(".ln-entrer__refus");
      return (zone?.textContent ?? "").length > 0 || globalThis.location.hash.includes("catalogue");
    },
    undefined,
    { timeout: 20000 },
  ).catch(() => undefined);

  const motApresAmorcage = await page.locator(".ln-entrer__refus").textContent();
  exiger_que(
    `l'amorçage aboutit${motApresAmorcage ? ` (refus : « ${motApresAmorcage} »)` : ""}`,
    (motApresAmorcage ?? "") === "",
  );

  // ── 3. Une entrée ordinaire, avec la clé qu'on vient d'enrôler ────────────
  await page.goto("/#entrer");
  await page.waitForSelector(".ln-entrer", { timeout: 15000 });
  await page.getByRole("button", { name: /^entrer$/i }).click();

  await page.waitForFunction(
    () => {
      const zone = document.querySelector(".ln-entrer__refus");
      return (zone?.textContent ?? "").length > 0 || globalThis.location.hash.includes("catalogue");
    },
    undefined,
    { timeout: 20000 },
  ).catch(() => undefined);

  const motApresEntree = await page.locator(".ln-entrer__refus").textContent().catch(() => "");
  const arrive = page.url().includes("catalogue");
  exiger_que(`l'entrée aboutit${motApresEntree ? ` (refus : « ${motApresEntree} »)` : ""}`, arrive);

  // ── 4. La session vaut-elle quelque chose ? ───────────────────────────────
  //
  // Pas sur la façade : « SESSIONS_EXIGEES » est encore **faux**, donc la façade exige le jeton
  // de service et refuse une session. C'est le drapeau qui le veut, et c'est la bascule du
  // point 6 qui l'inversera. Une assertion contraire ici dirait le contraire de la doctrine.
  //
  // On la sonde donc là où elle compte déjà : l'enrôlement, qui demande une session **et** le
  // droit d'administrer — celui que l'amorçage vient de donner.
  const surEnrolement = await page.evaluate(async () => {
    const r = await fetch("/enrolement/defi", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return r.status;
  });
  exiger_que(`la session et son droit ouvrent l'enrôlement (statut ${surEnrolement})`, surEnrolement === 200);

  const surFacade = await page.evaluate(async () => {
    const r = await fetch("/vue/apercu", { credentials: "include" });
    return r.status;
  });
  exiger_que(
    `la façade refuse encore la session, drapeau baissé (statut ${surFacade})`,
    surFacade === 401,
  );

  // ── 5. L'amorçage est-il clos ? ───────────────────────────────────────────
  exiger_que(
    "l'amorçage se referme dès qu'une clé existe",
    (await fetch(`${BASE}/amorce/defi`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": JETON },
      body: JSON.stringify({ nom: "Second" }),
    })).status === 409,
  );

  // ── 6. Sortir ferme bien la porte ─────────────────────────────────────────
  await page.evaluate(async () => {
    await fetch("/session", { method: "DELETE", credentials: "include" });
  });
  const apresSortie = await page.evaluate(async () => {
    const r = await fetch("/enrolement/defi", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return r.status;
  });
  exiger_que(`après la sortie, l'enrôlement est refusé (statut ${apresSortie})`, apresSortie === 401);

  if (refus.length > 0) console.log(`  (erreurs de console : ${refus.slice(0, 3).join(" · ")})`);
  await navigateur.close();
} finally {
  moteur.kill();
}

console.log(tenu ? "\nLa boucle entière tient." : "\nLa boucle ne tient pas.");
process.exit(tenu ? 0 : 1);
