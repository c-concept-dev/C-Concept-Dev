# RAPPORT LOT 10G.3B.3A — Audit runtime ADN

## Verdict

**PASS.** L'audit demandé est complet, reproductible et strictement documentaire. Aucun moteur, prompt, routeur, test, configuration ou fichier produit n'a été modifié. Les seuls ajouts sont dans `audit/lot10g3b3a/`.

## Freeze et reproductibilité

- Branche : `main`
- HEAD : `9482c65224f411424b10758424f6ad64bc9c0816`
- État initial : propre (`main...origin/main`)
- `npm test` initial : **25/25 PASS**
- `npm run guard` initial : **PASS**
- `git diff --check` initial : **PASS**
- ZIP de référence : SHA-256 `2c8be1597327cc2405cd4f9253c5c801e64d148bb298fc66550709653f504d41`
- ZIP et dépôt : HTML, shared core et deux Workers identiques octet pour octet.

### Hashes gelés initiaux

| Zone | SHA-256 |
|---|---|
| moteur Rapide | `7825950d5d6d880bae3e176dc2946d7266b2b3219d8c1cf3c4f7496d1a83e0bb` |
| moteur Architecte | `1e36eaef49fe3517448cb2c9565ab1cca42ce3d75089b0a27a43f214a2ac7433` |
| moteur Atelier | `8c3511538a96d4be3953270c4a5463da6b8d4807187a0b7d4b1c31c0e4589802` |
| FORMATS | `f4c9f1da5a14ecbe28d3cd0853871aa621909360ab6475bebeb76bc2191e141b` |
| VERROUS | `0019d7e26efab37164b435667d89494135cc4ae7f9f8206e95472435d1dd63ff` |
| ARCH_SYSTEM | `7fc7b736f6b80049c42a39d74a0fae76eee26d9e2af8249c7761de1ec3236317` |
| ARCH_SCHEMA | `a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b` |

## Réponses aux douze questions

### 1. Le système actuel respecte-t-il les cinq propriétés ?

**Partiellement, et de façon divergente selon les parcours.** Exécutabilité est la plus solide grâce au Decision Provider. Intentionalité est préservée mais réinterprétée plusieurs fois. Discipline est fragmentée. Complétude n'a pas de registre d'obligations commun. Conformité est contrôlée sur Envoi direct Atelier et sur l'analyse JSON Architecte, pas sur le livrable final Architecte.

### 2. Où les neuf techniques sont-elles réellement actives ?

- Le Decision Provider porte surtout la technique 3.
- `FORMATS`, `SECTIONS`, `VERROUS`, `assembler` et `CONTROLES` portent 1, 2, 4, 5, 6 et 8 pour Rapide/Atelier.
- Architecte matérialise 1, 6, 7 et 8 dans son analyse, ses composants et sa compilation.
- Les contrôles d'amorce, préambule, postambule, seuil et troncature rendent certaines règles opposables sur Envoi direct.

### 3. Où sont-elles absentes ou diluées ?

La technique 9 est absente comme invariant runtime commun. Les techniques 1, 2, 5, 6, 7 et 8 sont diluées entre deux architectures. Il n'existe ni activation commune après exploitabilité, ni preuve post-sortie universelle, ni statut de discipline partagé.

### 4. Les treize verrous sont-ils universels ?

**Le catalogue est complet, le comportement ne l'est pas.** Rapide/Atelier les activent principalement par profils associés aux formats ; seule l'activation de volume est réellement ajoutée dynamiquement. Architecte ne consomme pas le catalogue des treize verrous. Aucune activation n'est représentée avec raison et priorité.

### 5. Quelle part du runtime est commune à Rapide et Architecte ?

Le shell UI, la conservation de la demande/documents, l'orchestration initiale et le transport API sont communs. La compréhension, le contrat, les verrous, l'assemblage et le contrôle ne le sont pas. La couche commune s'arrête donc trop tôt, avant l'état d'autorité utile.

### 6. Où se trouve la principale duplication ?

Dans la **compréhension de la demande** : Decision Provider, détecteur lexical Rapide/Atelier, puis analyse sémantique Architecte. Quantité, format, hypothèses, provenance et contrôle sont également reconstruits. `assemblerAnnote` et la validation décision côté navigateur sont des miroirs manuels supplémentaires.

### 7. Pourquoi Architecte consomme-t-il autant ?

Chaque analyse envoie `ARCH_SYSTEM` (10 807 caractères) et `ARCH_SCHEMA` joliment sérialisé (23 839 caractères), soit environ 8 662 tokens estimés avant le contexte. Les entrées API réelles tournent autour de 9 670 tokens. L'analyse génère ensuite 5 000 à 8 000 tokens, la compilation répète objectif/contraintes/composants/contrôles, puis l'exécution finale consomme encore 1 300 à 2 847 tokens d'entrée. Moyenne complexe : **20 586 tokens**, contre 2 570,3 en LLM pur.

### 8. Pourquoi certains cas simples sont-ils sur-routés ?

S07, S08 et S09 n'ont pas été classés Architecte par un modèle. Workers AI puis Groq ont échoué en 502 ; le fallback local fixe toujours `architecte`. Cette politique explique les trois erreurs de route et le score simple de 70 %.

### 9. Quels contrôles sont réellement opposables ?

Le parse JSON, certains schémas, amorce, préambule, postambule, syntaxe, seuil, placeholders, troncature, hiérarchie et clôture sur le chemin Atelier. Côté Architecte, le schéma et les citations de l'analyse sont opposables. Ne sont pas opposables universellement : couverture complète des obligations, exactitude du livrable, technique 9, proportionnalité et critères finaux Architecte.

### 10. Quels invariants éthiques sont exécutables ?

L'entrée provider fermée, la non-injection du matériau comme instruction, la provenance/citation Architecte, la confirmation des préférences, le fallback technique ordonné et la protection des secrets sont exécutables. Autonomie de bout en bout, proportionnalité, transparence par verrou, efficacité humaine et contrôle final des droits restent partiels ou documentaires.

### 11. Peut-on construire ExecutionContract sans casser les moteurs ?

**Oui, en shadow mode et par projection.** Les briques existent : décision d'exécutabilité, contexte, déclarations, quantités, formats, hypothèses, critères et route. Le contrat doit d'abord les agréger sans remplacer les moteurs, puis comparer ses projections aux sorties historiques sous garde de hashes. Les zones manquantes sont obligations canoniques, politique d'exécution, raisons de verrous et éthique runtime.

### 12. Quels sont les dix écarts prioritaires ?

1. Absence d'ADN State / ExecutionContract commun.
2. Technique 9 non garantie.
3. Contrôle final Architecte absent.
4. Fallback prudent systématiquement Architecte.
5. Quatre échecs d'analyse sur dix cas complexes.
6. Coût fixe de l'analyse Architecte.
7. Sélection des verrous par profils sans justification.
8. Absence de registre canonique des obligations.
9. Analyse d'intention dupliquée.
10. Contrôles Atelier/Architecte non unifiés.

## Résultats benchmark utilisés comme preuves

- 30 cas ; Atelier 86,67 % de succès, LLM pur 100 %.
- Exactitude de route 90 %, mais 70 % sur cas simples.
- Latence moyenne Atelier 64,7 s contre 21,7 s ; surcoût 43,0 s.
- Tokens moyens 10 709,6 contre 1 573,3 ; surcoût 9 136,3.
- Complexes : succès Atelier 60 %, 20 586 tokens, 118,6 s.
- 53 réponses provider HTTP 502, aucun 429.
- S07/S08/S09 : double 502 puis fallback prudent Architecte.
- C03/C05/C09/C10 : sortie analyse plafonnée, plusieurs objets JSON, arrêt avant livrable.

## Topologie des livrables

- `01` : carte des flux et autorités.
- `02–04` : matrices des 5 propriétés, 9 techniques et 13 verrous.
- `05` : inventaire hardcoding.
- `06–08` : traces, waterfall Architecte, anomalies de route.
- `09–12` : contrôles, correction, éthique, duplications.
- `13–14` : mapping du futur contrat et registre d'anomalies.
- `runtime-map.json`, `anomalies.json` : vues structurées minimales.

## Conclusion

Le runtime actuel contient une part importante de l'ADN, mais sous forme de mécanismes locaux accumulés. Le problème central n'est pas l'absence totale de règles : c'est l'absence d'une autorité commune qui les rendrait cohérentes, proportionnées, traçables et contrôlables sur les trois parcours. Le lot suivant peut introduire cette autorité en lecture seule, sans réécrire les moteurs.

