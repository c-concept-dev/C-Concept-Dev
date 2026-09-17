# MONO-08 v0.7 — Remediation d'audit (paquet v1.1)

Audit independant du ZIP v1 (`5128c786…a3f0`) : SHA256SUMS PASS, syntaxe PASS,
45/45 tests rejoues — mais **NON GELABLE**, sur deux findings. Les deux etaient
reels. Corriges ici, et rien d'autre.

## F-AUD-V07-01 — BLOCKER : le fair scheduler n'etait pas raccorde

`fair-query-coverage.js` etait correct et teste. Mais
`prepare-existing-artifacts.js` retournait encore :

```js
const frozenRunner = buildOpenAlexConnectorRunner(deps, sourceId, opts.openAlexFetchImpl);
...
connectorRunners: { openalex: frozenRunner }
```

Le readiness simulait la couverture avec `buildFairCoverageConnectorRunner` et
annoncait 7/7, tandis qu'un PREPARE ulterieur, passant par
`pre.connectorRunners.openalex`, aurait utilise le runner v0.6 sequentiel et
memoise — reproduisant la famine 1/7.

**Le defaut de fond n'etait pas le scheduler : c'est que le readiness ne mesurait
pas le chemin reellement execute.** Un readiness qui teste autre chose que le
chemin d'execution ne prouve rien.

**Correction** : le chemin existing-artifacts expose desormais
`buildFairCoverageConnectorRunner(...)`, et lui seul. Le runner legacy v0.6 reste
inchange et disponible pour le chemin legacy.

**Ce qui n'a pas bouge** : MONO-01, v0.6, SearchProtocol, requetes, parts
equitables, deduplication, memoisation de l'agregat, et la semantique GLOBALE de
`maxResults` (plafond 100, somme des parts = 100).

### Le test qui manquait

`test/test-mono08-v0.7-integration.js` ne construit **jamais** le fair runner. Il
prend exactement celui que l'execution utilisera :

```js
const pre = await buildPreRetrievalArtifactsFromExisting(...);
const runner = pre.connectorRunners.openalex;   // LE runner du chemin d'execution
```

Le banc cible precedent construisait le fair runner directement : il ne pouvait
pas voir le defaut de raccordement. Verification faite dans l'ordre honnete —
**le test a d'abord ete execute contre l'implementation auditee et a echoue sur
12 controles** (TI-02, TI-03, TI-04.2 a TI-04.7, TI-05, TI-07, TI-08, TI-11),
puis il passe apres correction.

Il verifie aussi la memoisation de l'agregat : un second appel du runner ne
declenche **aucun fetch supplementaire** (7 avant, 7 apres).

## F-AUD-V07-02 — Hygiene de source

Les commentaires de `fair-query-coverage.js` etaient pollues par une expansion
shell : des accents graves autour de deux mots, dans un here-document **non
protege**, ont ete interpretes comme des substitutions de commande. L'un a
injecte la sortie de la commande d'identite du systeme ; l'autre a produit une
phrase mutilee.

**Correction** : commentaire reecrit, sobre et generique — identifiants locaux
non stables entre invocations, ordre de deduplication
(`provenance.originalReference`, puis `reference`, puis repli deterministe).
**Aucun changement de logique.** Les patchs de ce lot utilisent desormais des
here-documents proteges.

**Garde ajoutee** : le controle TI-11 scanne tous les fichiers du successeur.
Ses motifs sont assembles a partir de fragments — ecrits en clair, le detecteur
se signalerait lui-meme.

## Verifications

| | |
| --- | --- |
| Banc cible existant | **45/45 PASS**, aucun skip |
| Banc d'integration (nouveau) | **18/18 PASS** |
| Hygiene de source | **PASS** — 0 fichier contamine |
| Readiness v2 bout-en-bout | **PASS** — 7/7 requetes, 100 resultats, 0 rebuild |
| MONO-01 a MONO-07 | inchanges (empreintes agregees identiques) |
| MONO-08 v0.6 | inchange |
| Artefacts de mission | inchanges |
| Reseau / provider / LLM / PREPARE / RESUME | **0** |
