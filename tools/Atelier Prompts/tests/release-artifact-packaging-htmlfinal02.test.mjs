/* HTML-FINAL-02 — CE QU'ON PUBLIERAIT, SI ON PUBLIAIT.
 * ============================================================================
 *
 * Ce lot ne change pas le produit : il l'identifie. Après HTML-FINAL-01A, la
 * question n'est plus « est-ce que ça marche » mais « qu'est-ce que c'est,
 * exactement, et peut-on le refabriquer à l'identique ».
 *
 * CE FICHIER NE FAIT PAS CONFIANCE AU MANIFESTE. Il recalcule chaque valeur
 * que le manifeste annonce — empreintes, tailles, inventaire, blocs — et
 * compare. Un manifeste juste au moment de sa génération mais périmé ensuite
 * échouerait ici, ce qui est précisément ce qu'on lui demande.
 *
 * DEUX VALEURS NE SONT PAS RECALCULABLES : le nombre de tests au vert et
 * l'état des chaînes fermées. Aucun test ne peut compter la suite dont il fait
 * partie. Le manifeste les déclare comme des observations reportées, et ce
 * fichier vérifie qu'elles sont présentées comme telles plutôt que confondues
 * avec les mesures.
 *
 * ET IL NE DÉCLARE PAS LA RELEASE PRÊTE. L'artefact local l'est ; la release
 * ne l'est pas, parce que PERF-REAL-01 reste ouverte et que personne n'a
 * mesuré ce que ce produit coûte en temps réel à quelqu'un qui s'en sert.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CLASSES_DE_RELEASE, MOTIF_RUNTIME, inventaire, runtimeEmbarque } from '../tools/build-release-manifest.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_CANONIQUE = 'atelier-prompts-v11.5-lot10g-decision-provider.html';
const RUNTIME = 'core/adn/browser-runtime.generated.js';
const MANIFESTE = 'docs/RELEASE-MANIFEST.md';
const lire = (f) => fs.readFileSync(path.join(racine, f));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const html = lire(HTML_CANONIQUE).toString('utf8');
const manifeste = lire(MANIFESTE).toString('utf8');
const INV = inventaire();
/** Une valeur annoncée par le manifeste, lue dans sa ligne de tableau. */
const annonce = (champ) => {
  const m = new RegExp(`^\\| ${champ.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} \\| \`?([^|\`]+)\`? \\|$`, 'm').exec(manifeste);
  assert.ok(m, `le manifeste annonce « ${champ} »`);
  return m[1].trim();
};

// =================================================================================================
// §5 à §8 — L'ARTEFACT CANONIQUE
// =================================================================================================

test('T-HTMLFINAL02-01 : il n’y a qu’un seul HTML de release, et aucune ambiguïté', () => {
  const htmls = INV.fichiers.filter((x) => x.f.endsWith('.html'));
  assert.deepEqual(htmls.map((x) => x.f), [HTML_CANONIQUE], 'CANONICAL_RELEASE_HTML_COUNT = 1');
  assert.equal(htmls[0].classe, 'REQUIRED_HTML');
  /* Et aucun autre fichier du dépôt ne prétend être une page servable. */
  assert.equal(INV.fichiers.filter((x) => /\.(htm|xhtml)$/.test(x.f)).length, 0,
    'AMBIGUOUS_RELEASE_HTML_COUNT = 0');
});

test('T-HTMLFINAL02-02 : l’artefact canonique existe, à l’emplacement annoncé', () => {
  assert.equal(annonce('Chemin'), HTML_CANONIQUE);
  assert.ok(fs.existsSync(path.join(racine, HTML_CANONIQUE)));
  assert.equal(annonce('Taille'), `${fs.statSync(path.join(racine, HTML_CANONIQUE)).size} octets`);
  /* Il porte bien les trois modes, et rien de l'ancien pont supprimé. */
  for (const mode of ['data-mode="rapide"', 'data-mode="architecte"', 'data-mode="atelier"']) {
    assert.ok(html.includes(mode), `${mode} présent`);
  }
  /* Les symboles retirés par la chaîne CLEAN sont absents du CODE. Certains
     subsistent dans la prose qui documente leur retrait — c'est la trace, pas la chose. */
  const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const parti of ['ui-hidden-bridge', 'nextConversationAction', 'adpDecideRapide', 'lastProjection']) {
    assert.equal(code.includes(parti), false, `${parti} reste absent du code`);
  }
});

test('T-HTMLFINAL02-03 : l’empreinte de l’HTML canonique est celle du fichier, ici et maintenant', () => {
  assert.equal(annonce('SHA-256'), sha(lire(HTML_CANONIQUE)));
  assert.match(annonce('SHA-256'), /^[0-9a-f]{64}$/);
});

test('T-HTMLFINAL02-04 : l’empreinte du runtime compilé est celle du fichier', () => {
  assert.equal(annonce('SHA-256 du fichier'), sha(lire(RUNTIME)));
  assert.equal(annonce('Fichier'), RUNTIME);
});

test('T-HTMLFINAL02-05 : le runtime embarqué est exactement le build courant', () => {
  const embarque = runtimeEmbarque(html);
  assert.equal(embarque.sha256, sha(lire(RUNTIME)), 'EMBEDDED_RUNTIME_MATCHES_CURRENT_BUILD = YES');
  assert.equal(embarque.texte, lire(RUNTIME).toString('utf8'), 'et pas seulement à empreinte égale : octet pour octet.');
  assert.equal(annonce('SHA-256 du bloc embarqué'), embarque.sha256);
  assert.equal(annonce('Identiques'), 'oui');
  /* Le bloc porte l'empreinte de ses propres sources, posée par le build. */
  assert.match(embarque.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(annonce('Empreinte des sources compilées'), embarque.sourceSha256);
});

test('T-HTMLFINAL02-06 : la page contient un seul bloc de runtime', () => {
  assert.equal(runtimeEmbarque(html).nombre, 1, 'RUNTIME_BLOCK_COUNT = 1');
  assert.equal(annonce('Blocs de runtime dans la page'), '1');
  assert.equal((html.match(/\/\* GENERATED — LOT 10G/g) || []).length, 1);
});

test('T-HTMLFINAL02-07 : aucune charge de runtime dupliquée', () => {
  /* Ni deux blocs générés, ni un second exemplaire du même contenu ailleurs. */
  assert.equal((html.match(new RegExp(MOTIF_RUNTIME.source, 'g')) || []).length, 1,
    'DUPLICATE_EMBEDDED_RUNTIME_COUNT = 0');
  const runtime = lire(RUNTIME).toString('utf8');
  const signature = runtime.slice(runtime.indexOf('(function(global)'), runtime.indexOf('(function(global)') + 400);
  assert.equal(html.split(signature).length - 1, 1, 'une seule occurrence de l’ouverture du runtime.');
  /* Et chaque module compilé n'est défini qu'une fois dans le bundle. */
  const modules = [...runtime.matchAll(/const ([a-zA-Z0-9_$]+)=\(function\(deps\)/g)].map((m) => m[1]);
  assert.equal(new Set(modules).size, modules.length, `${modules.length} modules, aucun doublon`);
});

// =================================================================================================
// §9 à §13 — LA REFABRICATION
// =================================================================================================

test('T-HTMLFINAL02-08 : le build est reproductible et idempotent', () => {
  /* Le build est déterministe par construction : il concatène des sources dans un
     ordre déclaré et n'introduit ni horodatage ni aléa. On le vérifie plutôt que
     de le supposer — un `Date.now()` dans le bundle suffirait à le démentir. */
  const build = lire('tools/build-adn-browser-runtime.mjs').toString('utf8');
  const runtime = lire(RUNTIME).toString('utf8');
  for (const source of [build, runtime]) {
    assert.equal(/new Date\(\)|Date\.now\(\)|Math\.random\(\)|process\.hrtime/.test(source), false,
      'aucune source de non-déterminisme dans la chaîne de build.');
  }
  /* L'empreinte des sources inscrite dans le bloc est calculée sur les sources elles-mêmes. */
  assert.match(build, /source-sha256: \$\{sourceHash\}/);
  /* Et la réinjection est idempotente : le motif consommé est celui qui est réécrit. */
  assert.match(build, /const generatedBlock = \/\\\/\\\* GENERATED — LOT 10G\\\.3B\\\.3F\\\.\[12\][\s\S]{0,40}\/;/);
  assert.match(build, /html\.replace\(generatedBlock, \(\) => body\)/,
    'la réécriture passe par une fonction : $& et $` n’y sont pas interprétés.');
  /* ALL_COMPILED_MODULES_EXPOSED : chaque export déclaré existe dans le bundle. */
  const a = build.indexOf('const modules'); const b = build.indexOf('\n];', a);
  // eslint-disable-next-line no-eval
  const modules = eval(build.slice(build.indexOf('[', a), b + 2));
  const absents = modules.flatMap((m) => m.exports).filter((e) => !new RegExp(`\\b${e}\\b`).test(runtime));
  assert.deepEqual(absents, [], 'ALL_COMPILED_MODULES_EXPOSED = YES');
});

// =================================================================================================
// §14 à §17 — L'INVENTAIRE
// =================================================================================================

test('T-HTMLFINAL02-09 : le manifeste est complet — il dit tout ce qu’un publieur doit savoir', () => {
  for (const section of ['## Identité', '## Artefact canonique', '## Runtime compilé',
                         '## Plages gelées', '## Jeu de release', '## Ce qui ne part pas en release',
                         '## Dépendances réseau', '## État des chaînes', '## Dette encore ouverte',
                         '## Publication']) {
    assert.ok(manifeste.includes(section), `section présente : ${section}`);
  }
  for (const champ of ['Lot', 'Artefact', 'Commit local', 'Date du commit', 'Chemin', 'Taille',
                       'SHA-256', 'SHA-256 du fichier', 'SHA-256 du bloc embarqué',
                       'Blocs de runtime dans la page', 'LOCAL_ARTIFACT_READY', 'RELEASE_READY',
                       'PUSH_PERFORMED', 'DEPLOY_PERFORMED']) {
    annonce(champ);
  }
  assert.match(annonce('Commit local'), /^[0-9a-f]{40}$/);
  assert.equal(annonce('Lot'), 'HTML-FINAL-02');
  /* Et il dit lui-même qu'il n'est pas une autorité. */
  assert.match(manifeste, /Ce document est \*\*documentaire\*\*\. Aucun code de production ne le lit/);
  assert.equal([...html.matchAll(/RELEASE-MANIFEST/g)].length, 0,
    'aucun code de production ne référence le manifeste.');
});

test('T-HTMLFINAL02-10 : chaque valeur recalculable du manifeste est exacte', () => {
  /* Les plages gelées, telles que la référence les enregistre. */
  const gelees = JSON.parse(lire('anti-regression-baseline.json').toString('utf8')).hashes;
  for (const [nom, h] of Object.entries(gelees)) {
    assert.ok(manifeste.includes(`| ${nom} | \`${h}\` |`), `${nom} est annoncé à sa valeur de référence`);
  }
  /* L'inventaire, ligne à ligne. */
  assert.ok(manifeste.includes(`${INV.jeu.length} fichiers.`), 'le compte du jeu de release est juste');
  for (const x of INV.jeu) {
    assert.ok(manifeste.includes(`| ${x.classe} | \`${x.f}\` | \`${x.sha256}\` |`),
      `${x.f} est annoncé à son empreinte courante`);
  }
  assert.ok(manifeste.includes(`| Empreinte du jeu | \`${INV.empreinteJeu}\` |`),
    'RELEASE_FILESET_SHA256 recalculé et identique');
  /* Les deux observations non recalculables sont signalées comme telles. */
  assert.match(manifeste, /\*Observation reportée d'un lancement de tests : ces lignes ne sont pas recalculées\npar ce script\.\*/);
  const tests = /\| Tests au vert \| (\d+) \|/.exec(manifeste);
  assert.ok(tests && Number(tests[1]) >= 2562, 'le nombre de tests observé est reporté, et plausible');
});

test('T-HTMLFINAL02-11 : aucun artefact temporaire dans le périmètre', () => {
  const motifs = [/\.DS_Store$/, /\.tmp$/, /\.bak$/, /\.old$/, /\.orig$/, /\.rej$/, /~$/,
                  /\.log$/, /\.zip$/, /^coverage\//, /npm-debug/, /\.swp$/];
  const suspects = INV.fichiers.filter((x) => motifs.some((m) => m.test(x.f))).map((x) => x.f);
  assert.deepEqual(suspects, [], 'UNJUSTIFIED_TEMP_ARTIFACT_COUNT = 0');
  /* Les deux documents de provenance restent classés, non servis, et assumés. */
  const provenance = INV.fichiers.filter((x) => x.classe === 'PROVENANCE').map((x) => x.f).sort();
  assert.deepEqual(provenance, ['DIFF-COMPLET.patch', 'RAPPORT-LOT10G.2A.md']);
  for (const p of provenance) assert.equal(INV.jeu.some((x) => x.f === p), false, `${p} ne part pas en release`);
});

test('T-HTMLFINAL02-12 : chaque fichier suivi est classé, et le jeu de release est explicite', () => {
  const nonClasses = INV.fichiers.filter((x) => x.classe === 'NON_CLASSE').map((x) => x.f);
  assert.deepEqual(nonClasses, [], 'UNJUSTIFIED_UNTRACKED_ATELIER_FILE_COUNT = 0');
  assert.ok(INV.jeu.length >= 30 && INV.jeu.length === new Set(INV.jeu.map((x) => x.f)).size);
  for (const x of INV.jeu) {
    assert.ok(CLASSES_DE_RELEASE.includes(x.classe), `${x.f} appartient à une classe de release`);
    assert.ok(fs.existsSync(path.join(racine, x.f)), `${x.f} existe`);
    assert.equal(sha(lire(x.f)), x.sha256);
  }
  /* Le manifeste ne peut pas contenir sa propre empreinte : il est hors du jeu hashé. */
  assert.equal(INV.jeu.some((x) => x.f === MANIFESTE), false);
  /* Le worker d'évaluation, nommé « local-only », ne part pas non plus. */
  assert.equal(INV.jeu.some((x) => x.f.startsWith('workers/evaluation/')), false);
  assert.match(lire('workers/evaluation/wrangler.jsonc').toString('utf8'), /"name": "[^"]*local-only"/);
});

// =================================================================================================
// §38 à §44 — L'HYGIÈNE DE PUBLICATION
// =================================================================================================

test('T-HTMLFINAL02-13 : aucun chemin de machine locale dans le jeu de release', () => {
  const fautifs = [];
  for (const x of INV.jeu) {
    const src = lire(x.f).toString('utf8');
    if (/\/Users\/[A-Za-z0-9._-]+\/|\/home\/[a-z0-9_-]+\/|[A-Z]:\\\\/.test(src)) fautifs.push(x.f);
  }
  assert.deepEqual(fautifs, [], 'LOCAL_MACHINE_PATH_REFERENCE_COUNT = 0');
});

test('T-HTMLFINAL02-14 : aucun point de terminaison de développement', () => {
  /* Les quatre points de terminaison de la page sont déclarés en méta, et ce sont
     ceux de production. Ils ne sont pas modifiés par ce lot. */
  const metas = [...html.matchAll(/<meta name="(atelier-[a-z-]+)" content="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.equal(metas.length, 4);
  for (const [, url] of metas) {
    assert.match(url, /^https:\/\/atelier-decision-(groq|workers-ai)\.[a-z0-9]+\.workers\.dev\//);
    assert.equal(/localhost|127\.0\.0\.1|0\.0\.0\.0|staging|preview|ngrok|\.local\//.test(url), false);
  }
  /* Les mentions de localhost et de file:// qui subsistent sont de la prose et des
     replis défensifs : elles servent la page ouverte en local, elles n'en dépendent pas. */
  for (const x of INV.jeu) {
    const src = lire(x.f).toString('utf8');
    for (const m of src.matchAll(/https?:\/\/(localhost|127\.0\.0\.1)[^\s"')]*/g)) {
      assert.fail(`${x.f} : point de terminaison local actif — ${m[0]}`);
    }
  }
  assert.match(html, /la page doit\n    être servie en HTTPS ou ouverte depuis localhost/);
  assert.match(html, /Safari refuse localStorage et sessionStorage sur une origine file:\/\//);
});

test('T-HTMLFINAL02-15 : aucune ressource statique distante, donc aucune ne peut manquer', () => {
  assert.deepEqual([...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]), []);
  assert.deepEqual([...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]), []);
  assert.equal([...html.matchAll(/@font-face/g)].length, 0);
  const images = [...html.matchAll(/<img[^>]*\ssrc="([^"]{0,30})/g)].map((m) => m[1]);
  assert.ok(images.length > 0);
  assert.deepEqual(images.filter((s) => !s.startsWith('data:')), [], 'toutes les images sont embarquées');
  assert.deepEqual([...html.matchAll(/url\(([^)]*(?:https?:)?\/\/[^)]*)\)/g)].map((m) => m[1]), []);
  /* BROKEN_STATIC_RESOURCE_REFERENCE_COUNT = 0 : il n'y a aucune ressource à casser.
     Les hôtes distants qui subsistent sont des fournisseurs à l'exécution, voulus. */
  const hotes = [...new Set([...html.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(hotes, ['api.anthropic.com', 'atelier-decision-groq.11drumboy11.workers.dev',
    'atelier-decision-workers-ai.11drumboy11.workers.dev', 'console.anthropic.com', 'json-schema.org']);
});

test('T-HTMLFINAL02-16 : aucun drapeau de débogage ni de test dans l’artefact', () => {
  for (const drapeau of ['__DEV__', 'NODE_ENV', 'debugger;', 'TEST_MODE', '__TEST__',
                         'window.__debug', 'console.debug', 'DEBUG_MODE', 'VERBOSE']) {
    assert.equal(html.includes(drapeau), false, `RELEASE_DEBUG/TEST_FLAG : ${drapeau} absent`);
  }
  /* Aucune trace n'expose de secret ni de texte de la personne. */
  for (const x of INV.jeu) {
    const src = lire(x.f).toString('utf8');
    for (const motif of [/sk-[A-Za-z0-9]{16,}/, /AIza[0-9A-Za-z_-]{20,}/, /gsk_[A-Za-z0-9]{20,}/,
                         /-----BEGIN [A-Z ]*PRIVATE KEY-----/]) {
      assert.equal(motif.test(src), false, `SECRET_SCAN : ${x.f}`);
    }
    assert.equal(/console\.(log|warn|error)\([^)]*(apiKey|api_key|token|secret|password)/i.test(src), false,
      `SECRET_LOG_PATHS : ${x.f}`);
  }
  assert.equal(/sk-|AIza|gsk_|BEGIN [A-Z ]*PRIVATE KEY/.test(manifeste), false,
    'le manifeste ne porte aucun secret.');
});

// =================================================================================================
// §23 à §29 — LES LIMITES QUE CE LOT NE FRANCHIT PAS
// =================================================================================================

test('T-HTMLFINAL02-17 : les sept plages gelées sont enregistrées, et inchangées', () => {
  const reference = JSON.parse(lire('anti-regression-baseline.json').toString('utf8'));
  assert.equal(reference.algorithm, 'SHA-256');
  assert.deepEqual(Object.keys(reference.hashes).sort(), ['ARCH_SCHEMA', 'ARCH_SYSTEM', 'FORMATS',
    'VERROUS', 'moteur Architecte', 'moteur Atelier', 'moteur Rapide'].sort());
  for (const [nom, h] of Object.entries(reference.hashes)) {
    assert.match(h, /^[0-9a-f]{64}$/, `${nom} : empreinte bien formée`);
    assert.ok(manifeste.includes(h), `${nom} : reportée dans le manifeste`);
  }
  /* Les valeurs elles-mêmes, telles qu'elles sont depuis FC01b FINAL. */
  assert.equal(reference.hashes['moteur Rapide'], '3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664');
  assert.equal(reference.hashes.ARCH_SCHEMA, 'a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b');
});

test('T-HTMLFINAL02-18 : une seule dette reste ouverte, et le manifeste la nomme', () => {
  const dettes = lire('docs/OPEN-DEBTS.md').toString('utf8');
  const ouvertes = [...dettes.slice(dettes.indexOf('## Ouvertes'), dettes.indexOf('## Fermées'))
    .matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]);
  assert.deepEqual(ouvertes, ['PERF-REAL-01'], 'OFFICIAL_OPEN_DEBT_COUNT = 1');
  assert.match(manifeste, /- \*\*PERF-REAL-01\*\* — la latence réelle d'un fournisseur réel n'est pas mesurée\./);
  /* Et rien dans le produit ne prétend l'avoir mesurée. */
  assert.equal([...html.matchAll(/TTFI|time_to_first|latency_ms|p95_real/g)].length, 0,
    'REAL_PROVIDER_TTFI_PROVEN = NO');
});

test('T-HTMLFINAL02-19 : l’artefact local peut être déclaré prêt', () => {
  assert.equal(annonce('LOCAL_ARTIFACT_READY'), 'YES');
  /* Ce que « prêt localement » veut dire, et rien de plus : le fichier existe, il est
     unique, son runtime est celui du build, l'inventaire est complet et hashé. */
  assert.equal(INV.fichiers.filter((x) => x.classe === 'REQUIRED_HTML').length, 1);
  assert.equal(runtimeEmbarque(html).sha256, sha(lire(RUNTIME)));
  assert.match(INV.empreinteJeu, /^[0-9a-f]{64}$/);
  assert.equal(INV.fichiers.filter((x) => x.classe === 'NON_CLASSE').length, 0);
});

test('T-HTMLFINAL02-20 : la release, elle, n’est pas prête — et le manifeste le dit', () => {
  assert.equal(annonce('RELEASE_READY'), 'NO');
  assert.equal(annonce('PUSH_PERFORMED'), 'NO');
  assert.equal(annonce('DEPLOY_PERFORMED'), 'NO');
  assert.match(manifeste, /`RELEASE_READY` reste \*\*NO\*\* tant que `PERF-REAL-01` est ouverte/);
  /* La condition est liée à la dette, pas à une humeur : tant qu'elle est ouverte,
     aucune ligne du manifeste ne peut annoncer une release prête. */
  const dettes = lire('docs/OPEN-DEBTS.md').toString('utf8');
  const encoreOuverte = dettes.slice(dettes.indexOf('## Ouvertes'), dettes.indexOf('## Fermées')).includes('PERF-REAL-01');
  assert.equal(encoreOuverte, true);
  assert.equal(/\| RELEASE_READY \| YES \|/.test(manifeste), false);
});
