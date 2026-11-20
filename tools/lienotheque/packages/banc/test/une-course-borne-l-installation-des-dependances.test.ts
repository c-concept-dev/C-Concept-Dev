import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** `tools/lienotheque/` : trois niveaux au-dessus de `test/`, comme les autres contrôles du banc. */
const PROJET = new URL("../../../", import.meta.url);

/** Lot `Ci2 bis` — **l'installation des paquets système des moteurs est bornée à la montre, et
 *  prouvée après coup**.
 *
 *  ## Ce que la mesure a dit, et qui commande la forme de l'étape
 *
 *  Relevé le 20 novembre 2026 sur les dix dernières courses vertes et les cinq occurrences de
 *  `Ci2`, journaux lus un par un.
 *
 *  **L'étape ne travaille pas pour rien.** Navigateur par navigateur, sur l'image
 *  `ubuntu26-20261116.202.1` : chromium demande 21 paquets et les 21 sont déjà là ; firefox en
 *  demande 25 et il en manque 1 ; webkit en demande 51 et il en manque 21, qui en entraînent
 *  autant qu'il faut pour arriver à **185 paquets neufs, 139 Mo, 436 Mo sur le disque** — le même
 *  compte sur les dix courses. L'indice qui avait fait croire à une étape inutile,
 *  « libasound2t64 is already the newest version », était la première ligne d'une liste de 50 et
 *  en cachait 185 autres. **Ne pas appeler l'étape est donc exclu par la mesure.**
 *
 *  **Ce qui lâche est toujours l'acquisition, jamais le calcul ni le dépaquetage**, et en deux
 *  formes : quatre fois le résolveur de la machine est tombé (« Temporary failure resolving
 *  'azure.archive.ubuntu.com' », zéro octet récupéré en quinze minutes), une fois le miroir a
 *  rampé à 60 ko/s (72 paquets sur 193 en 14 min 40 s). Les deux sont des pannes passagères de
 *  l'hébergeur, et les deux se règlent par le même geste : **une tentative bornée, puis une
 *  seconde**.
 *
 *  ## Pourquoi ce contrôle se saute sur l'intégration continue, et le dit
 *
 *  Les deux courses prennent le dépôt en `sparse-checkout: tools/lienotheque` : `.github/` n'y
 *  est pas. Ce contrôle se saute donc en **paraissant dans le compte des sautés**, avec sa
 *  raison. L'idiome et sa raison viennent de
 *  `une-course-lit-le-programme-de-l-application.test.ts`. */

const RACINE_DU_DEPOT = new URL(
  `${execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: PROJET, encoding: "utf8" }).trim()}/`,
  "file:///",
);
const CI = new URL(".github/workflows/lienotheque-ci.yml", RACINE_DU_DEPOT);

const siLaCourseEstLa = existsSync(CI) ? it : it.skip;

/** Un pas du workflow : son nom et ses réglages, lus au niveau d'indentation du pas.
 *
 *  Pas de bibliothèque YAML dans ce dépôt — le lot `0l` en avait prévu une et Christophe l'a
 *  abandonnée le 18 novembre 2026, aucune course n'ayant jamais échoué sur une faute de syntaxe.
 *  Un pas est donc lu pour ce qu'il est : un `- name:` à six espaces, puis ses clefs à huit.
 *  Ce qui est au-delà (le corps d'un `run: |`) est gardé à part, en texte. */
interface Pas {
  readonly nom: string;
  readonly reglages: Readonly<Record<string, string>>;
  readonly corps: string;
  /** La ligne du `- name:`, pour qu'un refus désigne un endroit et non un pas « quelque part ». */
  readonly ligne: number;
}

function pasDuTravail(ci: string, travail: string): readonly Pas[] {
  const lignes = ci.split("\n");
  const debut = lignes.findIndex((une) => une === `  ${travail}:`);
  expect(debut, `le travail \`${travail}\` n'est pas dans le workflow`).toBeGreaterThanOrEqual(0);
  const pas: Pas[] = [];
  let courant: { nom: string; reglages: Record<string, string>; corps: string[]; ligne: number } | undefined;
  for (let rang = debut + 1; rang < lignes.length; rang += 1) {
    const ligne = lignes[rang] ?? "";
    // Un autre travail commence : deux espaces, un nom, deux points.
    if (/^ {2}\S/u.test(ligne)) break;
    const neuf = /^ {6}- name: (.+)$/u.exec(ligne);
    if (neuf) {
      if (courant) pas.push({ ...courant, corps: courant.corps.join("\n") });
      courant = { nom: neuf[1] ?? "", reglages: {}, corps: [], ligne: rang + 1 };
      continue;
    }
    if (!courant) continue;
    const reglage = /^ {8}([a-z-]+): ?(.*)$/u.exec(ligne);
    if (reglage) {
      courant.reglages[reglage[1] ?? ""] = (reglage[2] ?? "").trim();
      continue;
    }
    if (/^ {10}\S/u.test(ligne)) courant.corps.push(ligne.trim());
  }
  if (courant) pas.push({ ...courant, corps: courant.corps.join("\n") });
  return pas;
}

/** Tout ce qu'un pas exécute : sa commande en une ligne et le corps d'un `run: |`. */
const commandesDe = (un: Pas): string => `${un.reglages["run"] ?? ""}\n${un.corps}`;

describe("une course borne l'installation des dépendances des moteurs (lot Ci2 bis)", () => {
  /** Ce contrôle-ci ne se saute **jamais**. Un `../` de trop avait déjà fait sauter six contrôles
   *  en silence, et un garde-fou qui ne tourne jamais ne dit pas « vert » : il ne dit rien. */
  it("désigne vraiment la racine du dépôt, pour qu'un saut ne puisse pas venir d'un chemin faux", () => {
    expect(
      existsSync(new URL(".git", RACINE_DU_DEPOT)),
      `${RACINE_DU_DEPOT.pathname} n'est pas la racine du dépôt : les contrôles ci-dessous se sauteraient sans rien dire`,
    ).toBe(true);
  });

  siLaCourseEstLa(
    "n'appelle apt qu'en UN endroit : plus de `--with-deps` à côté (sauté si `.github/` n'est pas du lot)",
    () => {
      // Ce que le pas EXÉCUTE, jamais ce qu'un commentaire raconte : mon propre commentaire
      // nomme `--with-deps` pour dire qu'il est parti, et il a fait rougir ce contrôle à son
      // premier jet. Un garde-fou qui lit les commentaires s'accuse lui-même — c'est la leçon
      // de `lire-du-code`, payée le 20 novembre 2026.
      const pas = pasDuTravail(readFileSync(CI, "utf8"), "navigateurs");
      const avecDeps = pas
        .filter((un) => commandesDe(un).includes("--with-deps"))
        .map((un) => `ligne ${un.ligne} : ${un.nom}`);
      expect(
        avecDeps,
        "`install --with-deps` installait les mêmes 185 paquets par un second chemin : Ci2 frappait alors apt sur TOUTES les courses, pas une étape sur deux",
      ).toEqual([]);
    },
  );

  siLaCourseEstLa(
    "installe les paquets système à chaque course, cache repris ou non (sauté si `.github/` n'est pas du lot)",
    () => {
      const pas = pasDuTravail(readFileSync(CI, "utf8"), "navigateurs");
      const installations = pas.filter(
        (un) => commandesDe(un).includes("install-deps") && !commandesDe(un).includes("--dry-run"),
      );
      expect(installations.length, "il faut une première tentative et une seconde").toBe(2);
      // Les paquets système vivent dans la racine de la machine, pas dans `~/.cache/ms-playwright` :
      // une reprise du cache des moteurs ne les ramène pas. La première tentative ne doit donc
      // dépendre d'AUCUNE condition — c'était le défaut de forme de Ci2.
      expect(
        installations[0]?.reglages["if"],
        `ligne ${installations[0]?.ligne} : la première tentative ne se conditionne pas au cache`,
      ).toBeUndefined();
    },
  );

  siLaCourseEstLa(
    "borne chaque tentative à la montre, et n'allonge aucun délai (sauté si `.github/` n'est pas du lot)",
    () => {
      const pas = pasDuTravail(readFileSync(CI, "utf8"), "navigateurs");
      const installations = pas.filter(
        (un) => commandesDe(un).includes("install-deps") && !commandesDe(un).includes("--dry-run"),
      );
      // Six minutes par tentative : la plus lente des dix étapes vertes mesurées tient en 85 s,
      // une installation neuve en 92 s. Six minutes laissent ×4,2, au-delà de la barre ×3.
      // Et deux fois six font MOINS que le quart d'heure d'avant : on raccourcit, on n'allonge pas.
      const delais = installations.map((un) => Number(un.reglages["timeout-minutes"]));
      expect(delais, "une tentative sans délai attendrait le mur du travail entier").not.toContain(Number.NaN);
      for (const un of installations)
        expect(
          Number(un.reglages["timeout-minutes"]),
          `ligne ${un.ligne} : une tentative bornée à six minutes au plus`,
        ).toBeLessThanOrEqual(6);
      expect(
        delais.reduce((somme, un) => somme + un, 0),
        "les deux tentatives ensemble restent sous le quart d'heure que l'étape portait avant Ci2 bis",
      ).toBeLessThan(15);
    },
  );

  siLaCourseEstLa(
    "ne laisse passer que la PREMIÈRE tentative, jamais la seconde (sauté si `.github/` n'est pas du lot)",
    () => {
      const pas = pasDuTravail(readFileSync(CI, "utf8"), "navigateurs");
      const laissentPasser = pas.filter((un) => un.reglages["continue-on-error"] === "true");
      expect(
        laissentPasser.map((un) => `ligne ${un.ligne} : ${un.nom}`),
        "une seule étape a le droit de ne pas faire rougir la course, et c'est la première tentative",
      ).toHaveLength(1);
      expect(commandesDe(laissentPasser[0] as Pas)).toContain("install-deps");
      const seconde = pas.find(
        (un) => un.reglages["if"]?.includes("outcome == 'failure'") === true,
      );
      expect(seconde, "la seconde tentative part quand la première est perdue").toBeDefined();
      expect(
        (seconde as Pas).reglages["continue-on-error"],
        `ligne ${(seconde as Pas).ligne} : la seconde tentative perdue DOIT faire rougir la course`,
      ).toBeUndefined();
    },
  );

  siLaCourseEstLa(
    "met une preuve bloquante entre l'installation et le rendu (sauté si `.github/` n'est pas du lot)",
    () => {
      const pas = pasDuTravail(readFileSync(CI, "utf8"), "navigateurs");
      const preuve = pas.findIndex((un) => commandesDe(un).includes("install-deps --dry-run"));
      const rendu = pas.findIndex((un) => commandesDe(un).includes("test:navigateurs"));
      expect(preuve, "`install-deps --dry-run` sort non nul s'il manque un paquet : c'est la preuve").toBeGreaterThanOrEqual(0);
      expect(rendu, "le pas qui mesure le rendu").toBeGreaterThanOrEqual(0);
      // C'est cette preuve qui rend `continue-on-error` honnête : sans elle, une installation
      // manquée laisserait le rendu tourner derrière, et la course serait verte sans rien prouver.
      expect(preuve, "la preuve passe AVANT le rendu, sinon le rendu tourne derrière une installation manquée").toBeLessThan(rendu);
      const sienne = pas[preuve] as Pas;
      expect(sienne.reglages["continue-on-error"], `ligne ${sienne.ligne} : la preuve est bloquante`).toBeUndefined();
      expect(sienne.reglages["if"], `ligne ${sienne.ligne} : la preuve ne se conditionne à rien`).toBeUndefined();
    },
  );

  siLaCourseEstLa(
    "ne conditionne pas le rendu à l'installation : rien ne se saute en silence (sauté si `.github/` n'est pas du lot)",
    () => {
      const pas = pasDuTravail(readFileSync(CI, "utf8"), "navigateurs");
      const rendu = pas.find((un) => commandesDe(un).includes("test:navigateurs")) as Pas;
      expect(
        rendu.reglages["if"],
        `ligne ${rendu.ligne} : un rendu qui se saute quand l'installation a raté est la pire des issues — vert sans preuve`,
      ).toBeUndefined();
    },
  );
});
