# ATELIER_WORKER_RELEASE_ALIGNMENT_03D

**Nature** — alignement de provenance. **Aucune modification fonctionnelle, aucun déploiement.**
**`PRODUCTION_CODE_CHANGED = NO` · `PUSH = NO` · `DEPLOY = NO`**
**Manifeste lisible par machine** — `docs/ATELIER-WORKER-RELEASE-ALIGNMENT-03D.json`

> Ce lot ne déploie rien. Il rend le déploiement **décidable** : un commit source nommé, un bundle
> reproductible, les empreintes des composants critiques, et le delta fonctionnel exact que
> l'alignement activerait.

---

## A. Baseline

```text
branche                     main
HEAD                        169a74ab23d45589d1a6e89a411d23da019ae167
sous-arbre Atelier propre   oui
mutation externe depuis 916774d   docs/ATELIER-CODEX-INDEPENDENT-RUNTIME-AUDIT.md seulement
```

L'audit Codex a été ajouté par le propriétaire ; aucun fichier de code n'a bougé.

---

## B. La claim de l'audit, vérifiée

L'audit affirme que le Worker actif ne contient pas l'early-stop du Critique présent sur main. **Je
l'ai vérifié plutôt que de le reprendre.**

```text
main / workers/shared/operational-request-core.js:1963-2020
  « […] et aucune vague nouvelle n'est lancée après la preuve. »
  waveSize · waveStart · batchPlan · « dernier recours prouvé : c'est elle »
```

Et le commit qui l'a introduit porte son propre nom :

```text
93992e9  2026-09-07  DEEP-INTERACTION-EARLY-STOP-01: stop critic batches after first
                     proven last-resort question
```

La version Cloudflare active est datée du **7 septembre**. Elle a donc été publiée juste avant ce
commit, ce qui explique exactement l'écart constaté. `DEPLOYED_SOURCE_MATCHES_MAIN = NO` est
cohérent, et la cause est identifiée.

---

## C. Ce que je ne peux pas établir, et pourquoi je le dis

**`SOURCE_COMMIT` du runtime actif : non établissable d'ici.**

Déterminer le commit déployé exige de hacher le bundle publié, donc un accès administratif
Cloudflare en lecture. L'audit Codex l'a fait pour lire le code ; je ne manipule ni ne réclame ces
identifiants. Toute valeur que j'avancerais serait une déduction de dates, pas une preuve — et ce
lot demande précisément le contraire.

Ce que j'apporte à la place : **l'empreinte de l'état présumé déployé**, pour que la comparaison soit
possible dès que quelqu'un lit le bundle publié.

```text
93992e9~1   bundle SHA-256   926dbd75eb4df65303e9539c3ac8f24d922d45beef68940f0765931550ca14f9
            253 611 octets   occurrences de waveStart : 0   → early-stop ABSENT
```

Si le SHA-256 du bundle publié égale cette valeur, la provenance est close. S'il en diffère, le
commit déployé est un autre, et il restera à le trouver par bissection sur les empreintes.

---

## D. Bundle reproductible

```text
outil      wrangler 4.131.1
commande   wrangler deploy --dry-run --outdir <dir> --config workers/groq/wrangler.jsonc
```

`--dry-run` construit sans publier : c'est ce qui permet de produire les empreintes sans toucher au
service. Reproductibilité vérifiée, deux builds successifs du même commit :

```text
build 1   3624b0f0a69c15caaf4ba7873724a68737166f635038088d275b310a978c5763
build 2   3624b0f0a69c15caaf4ba7873724a68737166f635038088d275b310a978c5763
→ identiques octet pour octet
```

---

## E. Deux candidats, et un choix qui vous revient

Le lot exige « AUCUNE AUTRE MODIFICATION FONCTIONNELLE ». Or **HEAD contient le correctif 03B**, une
modification fonctionnelle de la consigne du plan rapide, délibérément non déployée et assortie de
deux réserves ouvertes. Déployer HEAD alignerait le Worker **et** activerait 03B.

Je fournis donc les deux, avec leurs empreintes.

| | **candidat A — alignement seul** | **candidat B — HEAD** |
|---|---|---|
| commit | `893c292` | `169a74a` |
| `BUNDLE_SHA256` | `ce1235917973ceb4e93850eb918d29d541546468e4bf2c63fcaace96e4c94ec4` | `3624b0f0a69c15caaf4ba7873724a68737166f635038088d275b310a978c5763` |
| octets | 257 477 | 259 143 |
| `FAST_PROMPT_HASH` | `9a88899127b09d194ea73bc3ca91f8d2111945f204d7d2cf3b884b6a8472c4c4` | `c4560c254896994c9a48dcd2ac382fba4f502edf5095a0a48cc8b08fd98bdd73` |
| consigne rapide | 794 octets (inchangée) | 2 243 octets (03B) |
| `CRITIC_PIPELINE_HASH` | `8856f09e4aef1b5cf2f61082620cc3c516f077763ddec39bd9111dc52de39325` | `8856f09e4aef1b5cf2f61082620cc3c516f077763ddec39bd9111dc52de39325` |
| `EARLY_STOP_PRESENT` | **YES** | **YES** |
| contient 03B | non | **oui** |

`CRITIC_PIPELINE_HASH` est **identique** sur les deux : 03B n'a pas touché le Critique, ce qui est
exactement ce que ce lot doit pouvoir affirmer.

**Candidat A satisfait la contrainte du lot à la lettre.** Candidat B y ajoute une décision que vous
avez déjà prise (option A du 03A) mais dont le 03B a laissé deux réserves ouvertes : conformité non
démontrée sur `openai/gpt-oss-20b`, et +88,5 % de jetons d'entrée par appel rapide.

---

## F. Composants critiques : source ↔ bundle

Vérifié sur les deux bundles construits.

```text
                                  candidat A    candidat B
waveSize                            PRÉSENT       PRÉSENT
waveStart                           PRÉSENT       PRÉSENT
batchPlan                           PRÉSENT       PRÉSENT
boucle de vagues (early-stop)        PRÉSENTE      PRÉSENTE
runBounded                          PRÉSENT       PRÉSENT
OPERATIONAL_REQUEST_ROLE_SEQUENCE   PRÉSENT       PRÉSENT
buildSubstitutionBatchSchema        PRÉSENT       PRÉSENT
FAST_INTERACTION_SYSTEM_PROMPT      PRÉSENT       PRÉSENT
phrase « dernier recours, jamais le premier »   PRÉSENTE   PRÉSENTE
critère 03B « Pour savoir si ce recours est atteint »   ABSENT   PRÉSENT
```

**Une erreur de méthode, corrigée avant de conclure.** Mon premier contrôle cherchait dans le bundle
les phrases `« aucune vague nouvelle n'est lancée après la preuve »` et `« dernier recours prouvé »`,
et les déclarait absentes — j'ai failli en conclure que l'early-stop n'était pas embarqué. Ce sont
des **commentaires**, retirés par esbuild. Le contrôle a été refait sur des marqueurs de code, et
l'early-stop est bien présent dans les deux bundles. La méthode était fautive, pas le bundle.

De même, la consigne est embarquée sous sa forme **tableau** (`FAST_INTERACTION_SYSTEM_PROMPT = [ … ]`
avec échappements `\xE9`), jointe à l'exécution : comparer la chaîne jointe au bundle échoue par
construction. `FAST_PROMPT_HASH` est donc calculé sur la **valeur résolue**, seule grandeur
comparable de part et d'autre.

---

## G. Delta fonctionnel réellement activé

Entre l'état présumé déployé et le candidat A, le delta ne touche que **deux fichiers** :

```text
workers/shared/fast-interactive-plane.js          +39
workers/shared/operational-request-core.js       +184 / −40
                                          total  +183 / −40
```

Trois commits fonctionnels, tous issus de lots déjà validés :

```text
93992e9  07-09  DEEP-INTERACTION-EARLY-STOP-01      arrêt des batches Critic après preuve
a960a89  08-09  ATELIER-RAPIDE-CONVERSATIONAL-FIX-01  Rapide pose la question
874a6bc  11-09  ATELIER-CONVERSATIONAL-CLOSURE-01D-G  le plan rapide ne parle que pour demander
```

Et deux commits **sans effet net**, qu'il faut connaître pour ne pas s'en inquiéter :

```text
03cdebb  12-09  « atelier »  − 6 845 lignes de workers/
7e2b53c  12-09  « atelier »  + 6 845 lignes de workers/     → net nul
```

L'alignement n'active donc pas un historique opaque : il active trois correctifs identifiés, sur
183 lignes.

---

## H. Procédure de déploiement, à votre main

Je ne l'exécute pas. Elle est écrite pour être vérifiable après coup.

```text
1. choisir le candidat  A (893c292) ou B (169a74a)
2. wrangler deploy --config workers/groq/wrangler.jsonc          ← vous
3. relever DEPLOYMENT_ID et CLOUDFLARE_VERSION rendus par la commande
4. relire le Worker actif et hacher son bundle
5. comparer ce SHA-256 au BUNDLE_SHA256 du candidat choisi  → REPO_RUNTIME_MATCH
6. corroboration comportementale, sans accès administratif :
   rejouer « je veux préparer un voyage a malaga fin novembre » sur /operational-request
   et comparer la latence Deep à la référence 03A — 116 384 / 115 713 / 122 717 ms sans
   early-stop. Une baisse franche corrobore l'activation ; elle ne la prouve pas seule.
```

Le secret `GROQ_API_KEY` reste hors de ce lot : il n'a été ni lu, ni affiché, ni écrit, ni requis.
`--dry-run` n'en a pas besoin.

---

## I. Verdict

```text
SUBLOT = ATELIER_WORKER_RELEASE_ALIGNMENT_03D

SOURCE_COMMIT          candidat A  893c292   (alignement seul, satisfait « aucune autre
                                              modification fonctionnelle »)
                       candidat B  169a74a   (HEAD, active en plus le correctif 03B)

BUNDLE_SHA256          A  ce1235917973ceb4e93850eb918d29d541546468e4bf2c63fcaace96e4c94ec4
                       B  3624b0f0a69c15caaf4ba7873724a68737166f635038088d275b310a978c5763

CLOUDFLARE_VERSION     9a4d536a-12ba-4bff-bc6d-eeba86cffb91  (actif, n° 115, 07-09, 100 %)
                       → inchangé : aucun déploiement n'a été effectué

DEPLOYMENT_ID          non applicable — aucun déploiement

FAST_PROMPT_HASH       A  9a88899127b09d194ea73bc3ca91f8d2111945f204d7d2cf3b884b6a8472c4c4  (794 o)
                       B  c4560c254896994c9a48dcd2ac382fba4f502edf5095a0a48cc8b08fd98bdd73  (2 243 o)

CRITIC_PIPELINE_HASH   8856f09e4aef1b5cf2f61082620cc3c516f077763ddec39bd9111dc52de39325
                       identique sur A et B : 03B n'a pas touché le Critique

EARLY_STOP_PRESENT     YES dans les deux bundles candidats
                       NO  dans l'état présumé déployé (93992e9~1, waveStart absent)

REPO_RUNTIME_MATCH     NO, et pas encore mesurable.
                       Le runtime actif est inchangé ; l'égalité ne pourra être prononcée
                       qu'après déploiement puis relecture du bundle publié.

BUNDLE_REPRODUCTIBLE   YES  (wrangler 4.131.1, deux builds identiques)
PRODUCTION_CODE_CHANGED  NO
PUSH                   NO
DEPLOY                 NO

LOT_GATE               GELABLE pour la préparation
                       NON_GELABLE pour l'alignement, qui exige votre déploiement

NEXT_SAFE_ACTION       choisir le candidat A ou B, puis déployer vous-même et relever
                       DEPLOYMENT_ID + CLOUDFLARE_VERSION. Je pourrai alors prononcer
                       REPO_RUNTIME_MATCH sur l'empreinte, sans toucher au service.
```
