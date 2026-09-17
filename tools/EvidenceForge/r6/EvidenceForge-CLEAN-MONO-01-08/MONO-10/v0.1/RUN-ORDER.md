# MONO-10 — Ordre du run professionnel réel #2

**Conception seule.** Ce document ne lance rien.

## Correction apportée à l'ordre proposé

L'ordre du mandat est correct sur l'essentiel. Trois ajustements s'imposent, tous
dictés par des contrats réels et non par préférence.

**1. La sonde LLM doit précéder EF-02C, pas la suivre.**
Le mandat la place en étape 6, après le corpus. Or `EF-02C` peut être coûteux
(un appel fournisseur par professionnel approuvé). Si le LLM est indisponible,
le run s'arrêtera de toute façon à EF-02D. Sonder avant EF-02C évite un travail
réseau inutile. La sonde ne dépend d'aucune sortie d'EF-02C.

**2. Un readiness *préliminaire* est nécessaire avant EF-02C.**
Le readiness complet (étape 7 du mandat) évalue les jumeaux et la couverture des
revues, qui n'existent pas encore à ce stade. Il faut donc deux passages :
`READINESS_PRE` (panel + LLM + corpus) avant EF-02D, et `READINESS_FULL` avant la
qualification.

**3. EF-02C doit recevoir l'adaptateur *composé*, pas l'adaptateur v0.2 nu.**
MONO-09 v0.2 filtre sur `verificationStatus === "VERIFIED"`. Sans composition, un
candidat vérifié mais **non approuvé** entrerait dans le corpus — A-07 resterait
ouvert. `createPanelGatedAdapter` doit être injecté dès EF-02C.

## Ordre retenu

| # | Étape | Nature | Arrêt |
|---|---|---|---|
| 1 | `EF-02A` découverte | runtime, réseau | — |
| 2 | `EF-02B` vérification d'identité | runtime, réseau | — |
| 3 | **ARRÊT — porte humaine du panel** | **acte humain** | **bloquant** |
| 4 | Décisions du propriétaire : `APPROVE` / `REJECT` / `DEFER`, exhaustives | acte humain | bloquant |
| 5 | **Sonde active de capacité LLM** | réseau, appel minimal | bloquant si ≠ `AVAILABLE` |
| 6 | `READINESS_PRE` — panel, LLM, exhaustivité des décisions | hors ligne | bloquant si `NOT_READY` |
| 7 | `EF-02C` corpus, **via `createPanelGatedAdapter`** | runtime, réseau | — |
| 8 | `EF-02D` / `EF-02E` éligibilité, panel, jumeaux | runtime, **LLM** | — |
| 9 | `EF-03A` → `EF-03D` schéma, revues, agrégation, stabilité | runtime, **LLM** | — |
| 10 | `EF-04-LINEAGE` / `EF-04A` legacy | runtime | drapeaux inchangés |
| 11 | `READINESS_FULL` | hors ligne | — |
| 12 | `ScientificQualification` | hors ligne | `NOT_QUALIFIED` interdit tout verdict |
| 13 | `ScientificUnifiedReport` | hors ligne | — |
| 14 | **Acceptation humaine du rapport final** | **acte humain** | **bloquant avant P0.2 seulement** |

## Points d'arrêt durs

- **Étape 3** — aucun EF-02C avant décisions humaines exhaustives. C'est la
  fermeture de A-07.
- **Étape 5** — aucun nœud LLM avant `LlmCapability.status == AVAILABLE`. C'est
  la fermeture de A-08.
- **Étape 12** — aucun verdict si `NOT_QUALIFIED`.
- **Étape 14** — aucun P0.2 sans acceptation. Le rapport existe sans elle ; son
  usage en aval non.

## Coût pour le propriétaire

Étape 4 : une fiche par candidat, avec nom, identifiants, affiliations, titres
des œuvres retenues l'ayant fait apparaître, discipline, origine, ambiguïtés.
**Le propriétaire ne lit pas le corpus professionnel** — il statue sur une
identité adossée à des œuvres qu'il a déjà auditées lors des 88 décisions.

Ordre de grandeur, à partir du corpus réel : 22 sources incluses → **51
auteurs-graines**, aucun récurrent. Le volume de décisions est donc du même ordre
que l'audit des 88 sources, et probablement plus rapide — l'objet est une
identité, pas un contenu.

## Ce que cet ordre ne résout pas

La pertinence scientifique du vivier. 51 graines issues de 22 sources dispersées
peuvent ne constituer aucun panel crédible pour JMJS P0.1. Le run peut être
parfaitement qualifié **en processus** et rester pauvre **en substance** — c'est
exactement ce que `QUALIFIED_WITH_RESERVATIONS` et `reservations[]` servent à
dire sans le masquer.
