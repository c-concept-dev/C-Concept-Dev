# MONO-10 — migration v0.12 → v0.13

MONO-10 v0.12 est **HISTORIQUE / IMMUTABLE**. v0.13 est un successeur
**strictement documentaire**, comme v0.12 l'était de v0.11.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11 ou de v0.12 n'a
> rien à modifier.

## 1. Pourquoi ce lot existe

L'audit final indépendant de v0.12 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** : `RUNTIME_BYTE_IDENTICAL_TO_V011 = YES`, aucun contournement critique
nouveau. La cause était que **deux affirmations connues fausses subsistaient dans
le lot candidat au gel**, plus cinq glissements documentaires mineurs.

C'est le même principe qui commandait v0.12, appliqué une fois de plus — et
cette fois à des endroits que v0.12 n'avait pas regardés :

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

### Décision de gouvernance sur le périmètre d'identité

`governance/README.md` est un **document de gouvernance, pas un composant
runtime**. Il peut donc être corrigé sans violer l'identité octet à octet du
runtime, à condition que la **Charte** reste byte-identique, qu'aucun fichier
runtime ne change, et qu'aucun test hérité ne change. C'est exactement ce que
v0.13 fait, et la preuve d'identité de `NON-REGRESSION.md` §1 l'énonce
explicitement : le périmètre runtime contient la Charte, **pas**
`governance/README.md`.

## 2. Les deux affirmations fausses corrigées

| # | Où | Ce que v0.12 affirmait | Ce que v0.13 dit |
|---|---|---|---|
| **B1** | `governance/README.md` | « `UNVERIFIABLE_HISTORICAL_LOTS = 9` maintenu, non dissimulé » — présenté comme **valeur courante** | valeur courante **0** ; la mesure de v0.11 était fausse ; ce qui reste non dissimulé, ce sont les **9 divergences** de 2 lots, marquées `[v0.11 — corrigé depuis]` |
| **B2** | `LLM-CAPABILITY-BOUNDARY.md` §3 | « le fait qu'il ait essayé est inscrit dans l'artefact de capacité » — sans qualification, donc lisible comme une garantie | qualifié **sur place** : traçabilité déclarative, pas autorité critique, valeur effaçable sans changer aucune décision, renvoi à R3 |

`governance/README.md` avait échappé à v0.12 pour une raison précise : les
détecteurs documentaires ne balayaient que les `.md` de la **racine**. C'est
corrigé — le balayage est désormais récursif (§5 ci-dessous).

## 3. Les cinq glissements mineurs corrigés

| # | Glissement | Correction |
|---|---|---|
| 4.1 | `OPEN-FINDINGS` annonçait « quatre réserves » alors qu'il en porte **cinq** | « cinq », et un tableau de statut R1–R5 |
| 4.2 | README annonçait 5 hypothèses, `MANIFEST` en portait 6 | harmonisés, et un contrôle automatique compare les deux |
| 4.3 | `NON-REGRESSION` §3 : « ne rend qu'une seule ligne » donné comme vérité générale | le **cadre** est nommé, et ce qui se transporte d'un cadre à l'autre est distingué du décompte |
| 4.4 | collision d'étiquettes : `(R1)`…`(R5)` désignaient à la fois les résidus de v0.9 **fermés** et les réserves ouvertes | les anciennes deviennent `V011-R1`…`V011-R5` ; les réserves ouvertes portent toujours un renvoi à `OPEN-FINDINGS.md` |
| 4.5 | la section de correction de `THREAT-MODEL` était insérée après la liste à puces de §6 | elle devient **§7**, avec une note explicite sur les deux séries d'étiquettes. *Correction incomplète en v0.13* : seuls les titres avaient été renumérotés, six puces de §6 restaient sous §7 (KF-5). Réellement déplacées en v0.14, structure vérifiée par `DOC-14` |

Le fichier `OPEN-FINDINGS-v0.12.md` est renommé **`OPEN-FINDINGS.md`** : c'est un
registre vivant, pas un instantané de version. Toutes les références ont été
mises à jour.

## 4. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11 **et** à v0.12.

```
cd MONO-10
for prev in v0.11 v0.12; do
  for d in core adapters validators schemas contracts; do diff -r $prev/$d v0.13/$d; done
  for f in test/fixture-chain.js test/test-mono10-v0.11.js \
           test/test-mono10-v0.11-integration.js \
           tools/aggregate-hash.js tools/operator-provisioning.js \
           tools/reference-llm-transport.js \
           governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md; do
    diff $prev/$f v0.13/$f; done
done
```

Vingt-quatre comparaisons, toutes **vides**. Les fichiers de test conservent
leurs noms de v0.11 : les renommer aurait rompu l'identité du jeu de fichiers,
donc la preuve.

## 5. Les détecteurs documentaires, rendus causaux

Les détecteurs de v0.12 étaient insuffisants de trois façons, et c'est pourquoi
B1 a survécu :

1. **balayage limité à la racine** — `governance/` était un angle mort. Désormais
   récursif ;
2. **témoin négatif par snippet isolé** — il prouvait que la regex reconnaît la
   phrase qu'on lui montre, pas que le scanner mord sur le **paquet réel**.
   Désormais : **mutation contrôlée des documents livrés** (*précision de
   v0.14* : mutation **en mémoire** du contenu réel, sans recopie ni écriture —
   v0.13 écrivait « recopiés dans un répertoire temporaire », ce qui n'était pas
   ce que son code faisait) ;
3. **fenêtre globale** — une correction cent lignes plus bas neutralisait le
   détecteur alors que la phrase restait trompeuse pour qui lisait la section
   seule. Désormais : **portée sectionnelle**.

Dix détecteurs, chacun avec sa mutation causale. Deux sont nouveaux : le code de
refus sur-promis (§5.4) et la cohérence du nombre de réserves. *L'audit final
de v0.13 a établi que quatre de ces détecteurs restaient insuffisants (F1 à F4)
— voir `MIGRATION-v0.13-v0.14.md` §3.*

## 6. Ce que v0.13 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API ;
- il ne déclare pas v0.13 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
