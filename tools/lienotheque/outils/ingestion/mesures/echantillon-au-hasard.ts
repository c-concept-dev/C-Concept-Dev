/** Ce que le moteur rend sur des documents **tirés au hasard**, et non sur ceux qui résistaient.
 *
 *  ## Pourquoi ce banc
 *
 *  Les mesures de la nuit du 2 novembre 2026 portent sur trois documents, et ces trois-là ont été
 *  choisis parce qu'ils échouaient. On ne peut rien conclure d'eux sur la bibliothèque : une
 *  correction jugée sur ses propres cas difficiles n'a aucune couverture démontrée.
 *
 *  Ce banc tire dans les documents **actifs** de la bibliothèque, et passe chacun par la chaîne
 *  entière — le même appel que la file de traitement. Le tirage est reproductible : l'ordre vient
 *  de l'empreinte du document mêlée à la graine, jamais de ce que le dossier rend en premier.
 *
 *  ## Le vivier
 *
 *  Les enregistrements viennent de l'inventaire de la bibliothèque, avec leurs provenances, comme
 *  l'hôte les présente. Le vivier est borné par les groupes de dépôt — et dans cette
 *  bibliothèque il n'y en a que deux pour 1 868 enregistrements : un document y est donc confronté
 *  à toute une archive, pas à ses seules pistes. C'est la situation réelle, et elle est plus dure
 *  que celle d'un dossier préparé à la main.
 *
 *  Usage : echantillon-au-hasard.ts <racine de la bibliothèque> <combien> [graine]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { instantaneDeLot } from "@lienotheque/ingestion";
import type { MediaInventorie } from "@lienotheque/recettes";

const racine = process.argv[2]!;
const combien = Number.parseInt(process.argv[3] ?? "12", 10);
const graine = process.argv[4] ?? "2026-11-02";

const base = join(racine, "base");
const actives = JSON.parse(readFileSync(join(base, "actives.json"), "utf8")) as Record<string, { version: string }>;
const inventaire = JSON.parse(readFileSync(join(base, "medias.json"), "utf8")) as MediaInventorie[];
const groupes = [...new Set(inventaire.flatMap((media) => media.provenances ?? []))];

/** Le nom déposé de chaque document, pour que le rapport se lise. */
const nomsParEmpreinte = new Map<string, string>();
for (const fichier of readdirSync(join(base, "travaux"))) {
  if (!fichier.endsWith(".json")) continue;
  try {
    const travail = JSON.parse(readFileSync(join(base, "travaux", fichier), "utf8")) as {
      empreinte?: string;
      sujet?: { nom?: string };
    };
    if (travail.empreinte !== undefined && travail.sujet?.nom !== undefined)
      nomsParEmpreinte.set(travail.empreinte, travail.sujet.nom);
  } catch {
    // Un travail illisible n'est pas une raison de ne pas mesurer les autres.
  }
}

// ── Le tirage, reproductible ────────────────────────────────────────────────────────────
const rang = (empreinte: string): string => createHash("sha256").update(`${graine}:${empreinte}`).digest("hex");
const tires = Object.keys(actives)
  .map((empreinte) => ({ empreinte, rang: rang(empreinte) }))
  .sort((un, autre) => un.rang.localeCompare(autre.rang))
  .slice(0, combien);

console.log(`bibliothèque : ${Object.keys(actives).length} document(s) actif(s), ${inventaire.length} enregistrement(s)`);
console.log(`groupes de dépôt : ${groupes.length}`);
console.log(`tirage : ${combien} document(s), graine « ${graine} »\n`);

type Issue = {
  readonly empreinte: string;
  readonly nom: string;
  readonly pages?: number;
  readonly endroits?: number;
  readonly essais?: number;
  readonly retenu?: string;
  readonly numerotation?: number;
  readonly liens: number;
  readonly abstention?: string;
  readonly secondes: number;
  readonly erreur?: string;
};

const issues: Issue[] = [];
for (const [place, { empreinte }] of tires.entries()) {
  const nom = nomsParEmpreinte.get(empreinte) ?? empreinte.slice(0, 12);
  const pdf = join(racine, "sources", empreinte.slice(0, 2), `${empreinte}.pdf`);
  const entete = `${String(place + 1).padStart(2)}/${combien}  ${nom}`;
  if (!existsSync(pdf)) {
    console.log(`${entete}\n    ⚠ fichier absent du dépôt`);
    issues.push({ empreinte, nom, liens: 0, secondes: 0, erreur: "fichier absent" });
    continue;
  }

  const depart = Date.now();
  let pages: number | undefined;
  let endroits: number | undefined;
  let essais: number | undefined;
  let retenu: string | undefined;
  let numerotation: number | undefined;
  try {
    const traite = await instantaneDeLot({
      pdf,
      // Le dossier n'est pas lu quand un inventaire est donné ; il faut seulement qu'il existe.
      medias: join(racine, "sources"),
      inventaireMedias: inventaire,
      provenancesMedias: groupes,
      description: join(base, "bibliotheque.json"),
      surPhase: (phase) => {
        // Chaque phase est écrite, avec l'heure. Sans cela, un document qui s'arrête ne dit pas
        // où : mesuré le 3 novembre 2026, un premier tirage a passé quarante-deux minutes sans
        // qu'on puisse savoir ce qu'il attendait. Un banc muet ne vaut pas mieux qu'un moteur
        // muet.
        process.stderr.write(`      ${new Date().toISOString().slice(11, 19)}  ${phase}\n`);
        const vuesPages = /^(\d+) page\(s\) regardée\(s\)/.exec(phase);
        if (vuesPages?.[1] !== undefined) pages = Number(vuesPages[1]);
        const vuesEndroits = /^(\d+) endroit\(s\) proposé\(s\)/.exec(phase);
        if (vuesEndroits?.[1] !== undefined) endroits = Number(vuesEndroits[1]);
        const vuesEssais = /^(\d+) essai\(s\) éprouvé\(s\)/.exec(phase);
        if (vuesEssais?.[1] !== undefined) essais = Number(vuesEssais[1]);
        const vuRetenu = /^endroit retenu : un signe de (.+?), numérotation (\d+) %/.exec(phase);
        if (vuRetenu?.[1] !== undefined) {
          retenu = vuRetenu[1];
          numerotation = Number(vuRetenu[2]);
        }
      },
    });
    const secondes = Math.round((Date.now() - depart) / 1000);
    const liens = traite.association.appariements.length;
    const abstention = traite.association.abstention?.raison;
    issues.push({
      empreinte,
      nom,
      ...(pages === undefined ? {} : { pages }),
      ...(endroits === undefined ? {} : { endroits }),
      ...(essais === undefined ? {} : { essais }),
      ...(retenu === undefined ? {} : { retenu }),
      ...(numerotation === undefined ? {} : { numerotation }),
      liens,
      ...(abstention === undefined ? {} : { abstention }),
      secondes,
    });
    console.log(
      `${entete}\n    ${pages ?? "?"} page(s), ${endroits ?? 0} endroit(s), ${essais ?? 0} essai(s) — ` +
        (retenu === undefined ? "aucun endroit retenu" : `retenu ${retenu} à ${numerotation} %`) +
        ` — ${liens} lien(s)${abstention === undefined ? "" : `, abstention ${abstention}`} — ${secondes} s`,
    );
  } catch (souci) {
    const secondes = Math.round((Date.now() - depart) / 1000);
    const erreur = souci instanceof Error ? souci.message : String(souci);
    issues.push({ empreinte, nom, liens: 0, secondes, erreur });
    console.log(`${entete}\n    ⚠ ${erreur.slice(0, 160)} — ${secondes} s`);
  }
}

// ── Ce que le tirage dit ────────────────────────────────────────────────────────────────
const aboutis = issues.filter((issue) => issue.erreur === undefined);
const avecEndroit = aboutis.filter((issue) => issue.retenu !== undefined);
const avecLiens = aboutis.filter((issue) => issue.liens > 0);
const parAbstention = new Map<string, number>();
for (const issue of aboutis) if (issue.abstention !== undefined) parAbstention.set(issue.abstention, (parAbstention.get(issue.abstention) ?? 0) + 1);

console.log(`\n══ ${aboutis.length} document(s) menés à terme sur ${issues.length} ══`);
console.log(`  un endroit retenu : ${avecEndroit.length}`);
console.log(`  des liens proposés : ${avecLiens.length}`);
for (const [raison, compte] of [...parAbstention].sort((un, autre) => autre[1] - un[1]))
  console.log(`  abstention ${raison} : ${compte}`);
const total = aboutis.reduce((somme, issue) => somme + issue.secondes, 0);
console.log(`  ${Math.round(total / 60)} min en tout, ${Math.round(total / Math.max(1, aboutis.length))} s par document`);

const sortie = join(process.env["TMPDIR"] ?? "/tmp", `echantillon-${graine}-${combien}.json`);
writeFileSync(sortie, JSON.stringify({ graine, combien, issues }, null, 2));
console.log(`\ndétail : ${sortie}`);
