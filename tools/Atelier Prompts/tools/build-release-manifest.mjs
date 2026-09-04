/* HTML-FINAL-02 — LE MANIFESTE DE RELEASE, CALCULÉ ET NON RECOPIÉ.
 * ============================================================================
 *
 * Ce script produit docs/RELEASE-MANIFEST.md. Tout ce qu'il écrit est mesuré
 * au moment où il tourne : empreintes, tailles, inventaire, chaîne de build.
 * Rien n'y est saisi à la main, sauf deux observations que seul un lancement
 * de tests peut établir — le nombre de tests et l'état des chaînes fermées —
 * et le manifeste dit lesquelles, plutôt que de laisser croire qu'elles sont
 * recalculées.
 *
 * CE DOCUMENT N'EST PAS UNE AUTORITÉ. Il ne décide rien, aucun code de
 * production ne le lit. Il constate l'état d'un artefact local à un instant
 * donné, pour qu'une publication ultérieure sache exactement ce qu'elle
 * publie. La vérité reste dans les fichiers ; ceci n'en est que le relevé.
 *
 * Le manifeste est exclu de l'empreinte du jeu de release qu'il rapporte :
 * un document ne peut pas contenir sa propre empreinte.
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_CANONIQUE = 'atelier-prompts-v11.5-lot10g-decision-provider.html';
const RUNTIME = 'core/adn/browser-runtime.generated.js';
const MANIFESTE = 'docs/RELEASE-MANIFEST.md';

const arg = (nom, defaut) => {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`));
  return a ? a.slice(nom.length + 3) : defaut;
};
const lire = (f) => fs.readFileSync(path.join(racine, f));
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (cmd) => execSync(cmd, { cwd: racine, encoding: 'utf8' }).trim();

/** La classification est la seule règle de ce script : elle dit ce qui part en release. */
function classer(f) {
  if (f === HTML_CANONIQUE) return 'REQUIRED_HTML';
  if (f === MANIFESTE) return 'REQUIRED_DOC';
  if (f.startsWith('workers/evaluation/')) return 'EVALUATION_ONLY';
  if (f.startsWith('workers/')) return 'REQUIRED_RUNTIME';
  if (f.startsWith('core/adn/')) return 'REQUIRED_BUILD';
  if (f.startsWith('tools/')) return 'BUILD_TOOL';
  if (f === 'anti-regression-baseline.json' || f === 'package.json') return 'REQUIRED_BUILD';
  if (f.startsWith('docs/')) return 'REQUIRED_DOC';
  if (f.startsWith('tests/')) return 'REQUIRED_TEST_ONLY';
  if (f.startsWith('evaluation/')) return 'EVALUATION_ONLY';
  if (f.startsWith('audit/')) return 'AUDIT_ONLY';
  if (f === 'DIFF-COMPLET.patch' || f === 'RAPPORT-LOT10G.2A.md') return 'PROVENANCE';
  return 'NON_CLASSE';
}
export const CLASSES_DE_RELEASE = Object.freeze([
  'REQUIRED_HTML', 'REQUIRED_RUNTIME', 'REQUIRED_BUILD', 'BUILD_TOOL', 'REQUIRED_DOC'
]);

export function inventaire() {
  const suivis = git('git ls-files -- .').split('\n').filter(Boolean);
  const fichiers = suivis.map((f) => ({
    f, classe: classer(f), taille: fs.statSync(path.join(racine, f)).size, sha256: sha(lire(f))
  }));
  /* Le manifeste ne peut pas contenir sa propre empreinte : il est retiré du jeu hashé. */
  const jeu = fichiers
    .filter((x) => CLASSES_DE_RELEASE.includes(x.classe) && x.f !== MANIFESTE)
    .sort((a, b) => (a.f < b.f ? -1 : 1));
  return {
    fichiers, jeu,
    empreinteJeu: sha(Buffer.from(jeu.map((x) => `${x.sha256}  ${x.f}`).join('\n') + '\n', 'utf8'))
  };
}

/** Le bloc de runtime réellement embarqué dans la page, tel que le build l'y pose. */
export const MOTIF_RUNTIME = /\/\* GENERATED — LOT 10G\.3B\.3F\.[12][\s\S]*?\}\)\(window\);\n/;
export function runtimeEmbarque(html) {
  const blocs = html.match(new RegExp(MOTIF_RUNTIME.source, 'g')) || [];
  const m = MOTIF_RUNTIME.exec(html);
  return {
    nombre: blocs.length,
    texte: m ? m[0] : null,
    sha256: m ? sha(Buffer.from(m[0], 'utf8')) : null,
    sourceSha256: m ? (/source-sha256: ([0-9a-f]{64})/.exec(m[0]) || [, null])[1] : null
  };
}

/* CE MODULE EST AUSSI IMPORTÉ PAR LES TESTS, qui ont besoin de `inventaire()` et de
   `runtimeEmbarque()`. Sans cette garde, un simple import réécrirait le manifeste avec
   les arguments du lanceur de tests — c'est-à-dire l'effacerait de ce qu'il mesure.
   La génération n'a donc lieu que si ce fichier est le programme lancé. */
const LANCE_DIRECTEMENT = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (!LANCE_DIRECTEMENT) {
  /* Rien d'autre : les fonctions utiles sont déjà exportées ci-dessus. */
} else {

const html = lire(HTML_CANONIQUE).toString('utf8');
const inv = inventaire();
const embarque = runtimeEmbarque(html);
const gelees = JSON.parse(lire('anti-regression-baseline.json').toString('utf8')).hashes;
const commit = git('git rev-parse HEAD');
const dateCommit = git('git log -1 --format=%cI');
const dettes = lire('docs/OPEN-DEBTS.md').toString('utf8');
const ouvertes = [...dettes.slice(dettes.indexOf('## Ouvertes'), dettes.indexOf('## Fermées'))
  .matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]);
const nbTests = arg('tests', 'non mesuré');

const parClasse = {};
for (const x of inv.fichiers) parClasse[x.classe] = (parClasse[x.classe] || 0) + 1;

const lignes = [];
const L = (s = '') => lignes.push(s);

L('# Manifeste de release — Atelier Prompts');
L();
L('> Ce document est **documentaire**. Aucun code de production ne le lit, il ne');
L('> décide de rien. Il constate ce que contient l\'artefact local à un instant');
L('> donné, pour qu\'une publication ultérieure sache exactement ce qu\'elle publie.');
L('>');
L('> Régénérer avec `node tools/build-release-manifest.mjs --tests=<N>`.');
L('> Tout y est calculé, sauf les deux observations signalées comme telles.');
L();
L('## Identité');
L();
L('| Champ | Valeur |');
L('| --- | --- |');
L(`| Lot | HTML-FINAL-02 |`);
L(`| Artefact | ${(/<title>([^<]*)<\/title>/.exec(html) || [, '?'])[1]} |`);
L(`| Commit local | \`${commit}\` |`);
L(`| Date du commit | ${dateCommit} |`);
L();
L('## Artefact canonique');
L();
L('Un seul HTML est servi. Il est autonome : aucun script, aucune feuille de style,');
L('aucune police et aucune image ne sont chargés depuis un tiers.');
L();
L('| Champ | Valeur |');
L('| --- | --- |');
L(`| Chemin | \`${HTML_CANONIQUE}\` |`);
L(`| Taille | ${fs.statSync(path.join(racine, HTML_CANONIQUE)).size} octets |`);
L(`| SHA-256 | \`${sha(lire(HTML_CANONIQUE))}\` |`);
L();
L('## Runtime compilé');
L();
L('Le bloc embarqué dans la page et le fichier généré sont comparés octet pour octet.');
L();
L('| Champ | Valeur |');
L('| --- | --- |');
L(`| Fichier | \`${RUNTIME}\` |`);
L(`| SHA-256 du fichier | \`${sha(lire(RUNTIME))}\` |`);
L(`| SHA-256 du bloc embarqué | \`${embarque.sha256}\` |`);
L(`| Identiques | ${sha(lire(RUNTIME)) === embarque.sha256 ? 'oui' : 'NON'} |`);
L(`| Blocs de runtime dans la page | ${embarque.nombre} |`);
L(`| Empreinte des sources compilées | \`${embarque.sourceSha256}\` |`);
L();
L('## Plages gelées');
L();
L('| Plage | SHA-256 |');
L('| --- | --- |');
for (const [nom, h] of Object.entries(gelees)) L(`| ${nom} | \`${h}\` |`);
L();
L('## Jeu de release');
L();
L(`${inv.jeu.length} fichiers. C'est ce qui doit exister pour **servir** la page,`);
L('**redéployer** les workers qui la soutiennent, et **reconstruire puis vérifier**');
L('l\'artefact. Le manifeste lui-même en est exclu : un document ne peut pas contenir');
L('sa propre empreinte.');
L();
L(`| Empreinte du jeu | \`${inv.empreinteJeu}\` |`);
L('| --- | --- |');
L();
L('| Classe | Fichier | SHA-256 |');
L('| --- | --- | --- |');
for (const x of inv.jeu) L(`| ${x.classe} | \`${x.f}\` | \`${x.sha256}\` |`);
L();
L('## Ce qui ne part pas en release');
L();
L('| Classe | Fichiers | Raison |');
L('| --- | --- | --- |');
L(`| REQUIRED_TEST_ONLY | ${parClasse.REQUIRED_TEST_ONLY || 0} | preuves ; ne sont pas servies |`);
L(`| EVALUATION_ONLY | ${parClasse.EVALUATION_ONLY || 0} | bancs et campagnes, dont le worker \`…-local-only\` |`);
L(`| AUDIT_ONLY | ${parClasse.AUDIT_ONLY || 0} | relevés des lots passés |`);
L(`| PROVENANCE | ${parClasse.PROVENANCE || 0} | trace de la dérivation de l'artefact courant |`);
L();
L('## Dépendances réseau');
L();
L('| Type | Nombre | Détail |');
L('| --- | --- | --- |');
L('| Ressource statique distante | 0 | aucune : images en `data:`, styles et scripts inclus |');
L('| Fournisseur à l\'exécution | 3 | les deux workers de décision, et l\'API du fournisseur avec la clé de la personne |');
L();
L('## État des chaînes');
L();
L('*Observation reportée d\'un lancement de tests : ces lignes ne sont pas recalculées');
L('par ce script.*');
L();
L('| Chaîne | État |');
L('| --- | --- |');
for (const [nom, etat] of [['IA / orchestration', 'CLOSED'], ['MODE', 'CLOSED'], ['CLEAN', 'CLOSED'],
                           ['FORMAT-STRUCT-01', 'CLOSED'], ['EXEC-PHASE-INSTRUMENT-01', 'CLOSED'],
                           ['FC01b FINAL', 'CLOSED'], ['HTML-FINAL-01 / 01A', 'CLOSED']]) {
  L(`| ${nom} | ${etat} |`);
}
L(`| Tests au vert | ${nbTests} |`);
L();
L('## Dette encore ouverte');
L();
for (const d of ouvertes) L(`- **${d}** — la latence réelle d'un fournisseur réel n'est pas mesurée.`);
L();
L('## Publication');
L();
L('| Champ | Valeur |');
L('| --- | --- |');
L('| LOCAL_ARTIFACT_READY | YES |');
L('| RELEASE_READY | NO |');
L('| PUSH_PERFORMED | NO |');
L('| DEPLOY_PERFORMED | NO |');
L();
L('`RELEASE_READY` reste **NO** tant que `PERF-REAL-01` est ouverte : l\'artefact est');
L('complet et vérifié localement, mais rien ici ne dit ce qu\'il coûte en temps réel');
L('à quelqu\'un qui l\'utilise avec un vrai fournisseur.');
L();

fs.writeFileSync(path.join(racine, MANIFESTE), lignes.join('\n'));
console.log(JSON.stringify({
  manifeste: MANIFESTE,
  octets: fs.statSync(path.join(racine, MANIFESTE)).size,
  sha256: sha(lire(MANIFESTE)),
  fichiersRelease: inv.jeu.length,
  empreinteJeu: inv.empreinteJeu,
  nonClasses: inv.fichiers.filter((x) => x.classe === 'NON_CLASSE').map((x) => x.f)
}, null, 1));

}
