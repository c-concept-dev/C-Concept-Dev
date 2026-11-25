import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dossierDuProjet, racineDuDepot } from "../src/racine-sans-github.js";

/** Le chemin du cache du produit se compose une seule fois (PLT-02, D33).
 *
 *  ## Pourquoi ce garde-fou existe
 *
 *  Le cache du produit se compose en **deux endroits, dans deux langages**. L'hôte Rust prend le
 *  dossier de cache de l'application et le passe à la chaîne par un tuyau ; la chaîne, en
 *  TypeScript, y creuse ses coins par `sousDossier(charge.cache, "<coin>")`. Ni l'un ni l'autre ne
 *  voit ce que fait l'autre, et le chemin final n'existe nulle part dans le code : il naît de la
 *  concaténation des deux.
 *
 *  C'est ainsi que l'hôte en est venu à passer `app_cache_dir().join("lectures")` tandis que la
 *  chaîne y ajoutait `lectures` : le chemin réel était `…/lectures/lectures`. Mesuré le
 *  24 novembre 2026, corrigé au lot `0z undecies`. Rien n'en échouait — un dossier de plus se crée
 *  sans bruit —, et c'est bien le problème : un défaut qui ne casse rien ne se corrige que si
 *  quelque chose le regarde.
 *
 *  Aucun contrôle d'exécution ne peut l'attraper : `app_cache_dir()` demande une application Tauri
 *  vivante, et le coin se creuse dans un autre processus. On lit donc les deux fichiers.
 *
 *  ## Ce qu'il tient, et ce qu'il laisse libre
 *
 *  Il tient une seule chose : **aucun nom de coin de la chaîne n'apparaît dans le chemin que
 *  l'hôte compose**. Il ne dit pas combien de coins il doit y avoir, ni comment ils s'appellent —
 *  Christophe peut en ajouter un demain —, ni où le dossier de cache de l'application se trouve,
 *  qui est l'affaire de la plateforme. */

const RACINE = racineDuDepot(new URL("../../../", import.meta.url));
const DOSSIER = dossierDuProjet(RACINE, new URL("../../../", import.meta.url));

const lire = (relatif: string): string => readFileSync(join(RACINE, DOSSIER, relatif), "utf8");

/** Le code seul : les lignes de commentaire retirées, pour qu'une explication ne soit pas jugée. */
const codeSeul = (source: string): string =>
  source
    .split("\n")
    .filter((ligne) => !/^\s*(?:\/\/|\*|\/\*)/u.test(ligne))
    .join("\n");

/** Les noms des coins que la chaîne creuse sous la racine que l'hôte lui donne. */
export function coinsDeLaChaine(source: string): readonly string[] {
  return [...codeSeul(source).matchAll(/sousDossier\(\s*charge\.cache\s*,\s*"([^"]+)"\s*\)/gu)].map(
    (trouve) => trouve[1] ?? "",
  );
}

/** Ce que l'hôte ajoute au dossier de cache de l'application, s'il ajoute quelque chose.
 *
 *  Rend la suite des arguments de `.join(…)` enchaînés après `app_cache_dir()`, dans l'ordre. */
export function ajoutsDeLHote(source: string): readonly string[] {
  const code = codeSeul(source);
  const depart = code.indexOf("app_cache_dir()");
  if (depart === -1) return [];
  // Jusqu'au point-virgule qui ferme l'expression : c'est là que le chemin est fini.
  const fin = code.indexOf(";", depart);
  const expression = code.slice(depart, fin === -1 ? code.length : fin);
  return [...expression.matchAll(/\.join\(\s*"([^"]+)"\s*\)/gu)].map((trouve) => trouve[1] ?? "");
}

describe("le chemin du cache du produit se compose une seule fois (PLT-02)", () => {
  it("PLT-02 : les deux fichiers sont bien lus, et il y a des coins à juger", () => {
    const coins = coinsDeLaChaine(lire("outils/ingestion/src/executant.ts"));
    expect(coins.length, "aucun coin trouvé : ce garde-fou ne garde plus rien").toBeGreaterThan(0);
    expect(lire("apps/app/src-tauri/src/lib.rs")).toContain("app_cache_dir()");
  });

  /** **Le cœur du garde-fou.** */
  it("PLT-02 : l’hôte n’ajoute aucun nom de coin au dossier de cache de l’application", () => {
    const coins = coinsDeLaChaine(lire("outils/ingestion/src/executant.ts"));
    const ajouts = ajoutsDeLHote(lire("apps/app/src-tauri/src/lib.rs"));
    const doubles = ajouts.filter((ajout) => coins.includes(ajout));
    expect(
      doubles,
      `l'hôte ajoute un nom que la chaîne ajoute aussi : le chemin réel porterait « ${doubles
        .map((nom) => `${nom}/${nom}`)
        .join(" », « ")} »`,
    ).toStrictEqual([]);
  });

  it("PLT-02 : aujourd’hui l’hôte n’ajoute rien du tout", () => {
    expect(
      ajoutsDeLHote(lire("apps/app/src-tauri/src/lib.rs")),
      "le dossier de cache de l'application se passe nu ; la chaîne y creuse ses coins",
    ).toStrictEqual([]);
  });
});

describe("ce que ce garde-fou voit, et ce qu’il laisse passer", () => {
  /** La preuve qu'il n'est pas aveugle, sur des sources **données** : la part qui juge est pure.
   *  La mutation du vrai fichier se fait à côté, dans un clone jetable. */
  const HOTE_FAUTIF = [
    "    let cache = app",
    "        .path()",
    "        .app_cache_dir()",
    '        .map_err(|e| format!("Cache de travail introuvable : {e}"))?',
    '        .join("lectures");',
  ].join("\n");
  const HOTE_JUSTE = [
    "    let cache = app",
    "        .path()",
    "        .app_cache_dir()",
    '        .map_err(|e| format!("Cache de travail introuvable : {e}"))?;',
  ].join("\n");
  const CHAINE = 'cache: sousDossier(charge.cache, "lectures"),';

  it("accuse l’hôte qui ajoute un nom de coin, et laisse passer celui qui n’ajoute rien", () => {
    const coins = coinsDeLaChaine(CHAINE);
    expect(coins).toStrictEqual(["lectures"]);
    expect(ajoutsDeLHote(HOTE_FAUTIF).filter((ajout) => coins.includes(ajout))).toStrictEqual(["lectures"]);
    expect(ajoutsDeLHote(HOTE_JUSTE).filter((ajout) => coins.includes(ajout))).toStrictEqual([]);
  });

  it("ne juge pas un `.join` cité en commentaire", () => {
    const enProse = [
      "    // Un `.join(\"lectures\")` ici donnait `lectures/lectures`.",
      "    let cache = app.path().app_cache_dir()?;",
    ].join("\n");
    expect(ajoutsDeLHote(enProse)).toStrictEqual([]);
  });

  it("ne confond pas un `.join` d’une autre expression avec celui du cache", () => {
    const apres = [
      "    let cache = app.path().app_cache_dir()?;",
      '    let autre = racine.join("lectures");',
    ].join("\n");
    expect(ajoutsDeLHote(apres), "l'expression du cache finit à son point-virgule").toStrictEqual([]);
  });
});
