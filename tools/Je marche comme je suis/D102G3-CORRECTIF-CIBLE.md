# D102G3 — Correctif ciblé avant gel de D102

**Projet :** Je marche comme je suis (JMJS)  
**Objet :** corriger uniquement les classes d’erreur démontrées par la campagne réelle D102G2  
**Statut :** lot correctif ciblé, sans élargissement fonctionnel  
**Principe :** ne pas refondre D102, ne pas ajouter d’ontologie générale, ne pas toucher au moteur de routage.

---

# 1. Objectif

D102G3 doit corriger les erreurs structurelles encore observées dans l’interprétation du champ :

> « Où et quand survient la gêne ? »

Le lot doit rester strictement limité à cinq axes :

1. négation locale appliquée aux zones corporelles ;
2. extraction des contextes terrain indépendamment de leur position grammaticale ;
3. verrouillage de la latéralité par segment/clause ;
4. symétrie de la détection de conflit texte ↔ curseur douleur ;
5. quelques extensions lexicales/temporales déjà démontrées par les tests réels.

Aucune autre évolution n’est autorisée dans ce lot.

---

# 2. Non-objectifs

D102G3 ne doit pas :

- construire un graphe sémantique complet ;
- ajouter un modèle LLM ou ML embarqué ;
- introduire une API ;
- modifier la logique de routage ;
- modifier la structure métier des limitations ;
- enrichir D103 ;
- ajouter des règles médicales ;
- inventer de nouveaux seuils ;
- convertir automatiquement une information textuelle en contrainte sans confirmation ;
- modifier le comportement de « Prendre en compte ».

---

# 3. Axe 1 — Négation locale des zones corporelles

## Problème démontré

Les négations portant sur les zones corporelles sont actuellement ignorées.

Exemples en échec :

- « Ma cheville gauche me gêne, mais le genou droit ne me fait pas mal. »
- « Je n’ai pas mal au genou gauche, c’est la hanche gauche qui me gêne. »
- « Le dos ne me gêne pas aujourd’hui, mais hier il était très douloureux. »
- « J’ai été opéré du genou droit il y a deux ans, mais aujourd’hui il ne me gêne pas du tout. »

## Comportement attendu

La polarité doit être déterminée **localement**, au niveau du segment ou de la clause contenant la zone.

Exemples :

```text
"cheville gauche me gêne"
→ Cheville gauche ACTIVE

"genou droit ne me fait pas mal"
→ Genou droit NON ACTIF
```

```text
"je n'ai pas mal au genou gauche"
→ Genou gauche NON ACTIF

"hanche gauche qui me gêne"
→ Hanche gauche ACTIVE
```

## Règle

Une zone corporelle explicitement niée ne doit pas produire de chip actif.

La présence historique de la zone dans la phrase ne doit pas prendre le dessus sur une négation temporelle actuelle.

Exemple :

```text
"opéré du genou droit il y a deux ans"
+
"aujourd'hui il ne me gêne pas"
→ aucun Genou droit actif aujourd'hui
```

## Contraintes

Ne pas supprimer une zone si la négation concerne une autre clause.

Ne pas transformer toutes les négations en « absence globale de douleur ».

La portée doit rester locale.

---

# 4. Axe 2 — Terrain indépendant de la syntaxe

## Problème démontré

Le terrain est correctement extrait dans des formulations comme :

```text
"genou gauche en descente"
```

mais pas systématiquement dans :

```text
"les descentes me font mal"
"c'est seulement en descente que j'ai mal"
"les chemins irréguliers me fatiguent vite"
```

## Comportement attendu

Les concepts suivants doivent être détectables quelle que soit leur position grammaticale :

- montée ;
- descente ;
- terrain irrégulier / chemin irrégulier.

Exemples :

```text
"Les descentes me font mal au genou droit."
→ Genou droit
→ Descente
```

```text
"Sur le plat aucun souci, c'est seulement en descente que j'ai mal."
→ Descente
→ ne pas interpréter "aucun souci" comme absence globale de douleur
```

```text
"Les chemins irréguliers me fatiguent vite, sans douleur particulière."
→ Terrain irrégulier
→ Fatigue si la capacité existe
→ aucune douleur corporelle inventée
```

## Contrainte

Ne pas créer de faux déclencheur lorsqu’un terrain est explicitement bien toléré.

Exemple :

```text
"Les montées vont bien"
→ ne pas produire Montée comme limitation
```

---

# 5. Axe 3 — Latéralité confinée à la bonne zone

## Problème démontré

Phrase :

> « J’ai une gêne à l’épaule droite et le cou tire quand je marche longtemps. »

Résultat erroné :

```text
Épaule droite
Cou droit
```

Alors que seul « épaule » est latéralisé.

## Comportement attendu

La latéralité doit être associée à la zone de sa clause ou de son groupe nominal, jamais propagée à une autre zone sans indice explicite.

Attendu :

```text
Épaule droite
Cou
```

## Tests de non-régression

```text
"genou gauche et hanche droite"
→ Genou gauche
→ Hanche droite
```

```text
"cheville droite en montée et genou gauche en descente"
→ Cheville droite
→ Genou gauche
```

Aucune ambiguïté globale si l’association locale est claire.

---

# 6. Axe 4 — Conflit texte ↔ curseur symétrique

## Problème démontré

Le système sait détecter :

```text
texte = absence de douleur
curseur = 5
→ conflit
```

mais pas toujours :

```text
texte = douleur explicite
curseur = 0
→ conflit
```

## Comportement attendu

La détection doit être symétrique.

### Cas A

```text
curseur 0
"Mon genou gauche me fait mal en descente."
→ conflit texte/curseur
```

### Cas B

```text
curseur 5
"Pas mal aujourd'hui, ça va plutôt bien."
→ conflit texte/curseur
```

### Cas C

```text
curseur 0
"Je n'ai pas vraiment mal aujourd'hui."
→ pas de conflit
```

### Cas D — non-régression D102G1

```text
curseur > 0
"Sur le plat aucun souci, c'est seulement en descente que j'ai mal."
→ ne PAS conclure absence globale de douleur
```

---

# 7. Axe 5 — Extensions lexicales et temporelles démontrées

## 7.1 Tendance par rapport à l’habitude

Ajouter les formulations déjà observées :

```text
"ça va mieux"
"moins qu'habituellement"
"moins que d'habitude"
→ amélioration
```

```text
"plus fort que d'habitude"
"nettement plus fort que d'habitude"
"bien plus forte qu'habituellement"
→ aggravation
```

Ne pas généraliser au-delà de ce qui peut être traité proprement.

## 7.2 Durées verbalisées

Ajouter au minimum :

```text
"trois quarts d'heure"
→ ~45 min
```

Préserver :

```text
"vingt minutes"
→ 20 min

"une demi-heure"
→ ~30 min
```

## 7.3 Fatigue liée au contexte

Si le moteur possède déjà une représentation explicite de fatigue fonctionnelle, la phrase :

```text
"Les chemins irréguliers me fatiguent vite"
```

doit pouvoir conserver cette information.

Sinon :
- ne rien inventer ;
- laisser le terrain correctement extrait ;
- documenter la fatigue comme non représentée.

---

# 8. Tests ciblés obligatoires

Après correction, rejouer au minimum ces cas.

## Négation

1. `Cheville gauche me gêne, mais le genou droit ne me fait pas mal.`
2. `Je n'ai pas mal au genou gauche, c'est la hanche gauche qui me gêne.`
3. `Le dos ne me gêne pas aujourd'hui, mais hier il était très douloureux.`
4. `J'ai été opéré du genou droit il y a deux ans, mais aujourd'hui il ne me gêne pas du tout.`

## Terrain

5. `Sur le plat aucun souci, c'est seulement en descente que j'ai mal.`
6. `Je marche bien sur le plat mais les descentes me font mal au genou droit.`
7. `Les chemins irréguliers me fatiguent vite, sans douleur particulière.`

## Latéralité

8. `J'ai une gêne à l'épaule droite et le cou tire quand je marche longtemps.`

## Conflit curseur

9. Curseur 0 + `Mon genou gauche me fait mal en descente.`
10. Curseur 5 + `Pas mal aujourd'hui, ça va plutôt bien.`
11. Curseur 0 + `Je n'ai pas vraiment mal aujourd'hui.`

## Baseline / tendance

12. `D'habitude mon genou gauche me gêne un peu, mais aujourd'hui ça va mieux.`
13. `J'ai souvent mal à la hanche droite, mais aujourd'hui c'est nettement plus fort que d'habitude.`

## Temporalité

14. `Ça va au début, puis après trois quarts d'heure les hanches deviennent douloureuses.`

---

# 9. Variantes anti-surapprentissage

Ajouter au moins six variantes non identiques aux phrases de benchmark.

Exemples :

```text
"Mon genou droit ne me gêne absolument pas aujourd'hui."
```

```text
"La hanche droite va bien, c'est la gauche qui tire."
```

```text
"En descente seulement, mon genou commence à tirer."
```

```text
"Quand le chemin devient irrégulier je fatigue plus vite."
```

```text
"L'épaule gauche me gêne et le cou est un peu raide."
```

```text
"Depuis quelques jours c'est mieux que d'habitude."
```

Objectif :
éviter un patch phrase-par-phrase.

---

# 10. Tests de non-régression obligatoires

Les comportements suivants doivent rester corrects :

```text
"J'ai mal au genou gauche et à la hanche droite."
→ Genou gauche + Hanche droite
```

```text
"La cheville droite tire en montée et mon genou gauche en descente."
→ Cheville droite + Montée + Genou gauche + Descente
```

```text
"J'ai mal en montée mais aucun problème en descente."
→ Montée uniquement
```

```text
"Au bout d'une demi-heure je fatigue et j'ai besoin de m'asseoir."
→ ~30 min + pause assise
```

```text
"Ça tire un peu, ça dépend des jours."
→ clarification, aucune zone inventée
```

```text
"En général ça va, sauf parfois."
→ aucune contrainte inventée
```

Et surtout :

```text
"Sur le plat aucun souci"
```

ne doit jamais être interprété comme :

```text
absence globale de douleur
```

---

# 11. Inertie et confirmation

D102G3 ne doit rien changer à la règle existante :

```text
texte
→ interprétation candidate
→ affichage
→ confirmation utilisateur
→ modèle structuré
```

Avant « Prendre en compte » :

- aucune limitation métier modifiée ;
- aucun paramètre moteur modifié ;
- aucun routage influencé.

Après confirmation uniquement :
- seules les informations confirmées peuvent être préremplies.

---

# 12. Critères d’acceptation

D102G3 peut être considéré comme validé si :

1. les 4 cas de négation corporelle passent ;
2. les 3 cas terrain ciblés passent ;
3. la contamination de latéralité disparaît ;
4. le conflit texte douloureux + curseur 0 est détecté ;
5. aucun faux conflit nouveau n’apparaît ;
6. « trois quarts d’heure » est compris ;
7. amélioration/aggravation par rapport à l’habitude est correctement différenciée ;
8. les tests de non-régression restent verts ;
9. l’inertie avant confirmation reste intacte ;
10. `npm test` reste entièrement vert ;
11. l’audit champs/choix reste sans orphelin ;
12. le build autonome réussit.

---

# 13. Règle de sortie

Après D102G3, refaire une campagne courte ciblée.

Si les classes structurelles suivantes sont fermées :

- négation corporelle ;
- terrain syntaxique ;
- latéralité ;
- conflit curseur symétrique ;

et qu’aucune régression nouvelle n’apparaît, D102 pourra être **gelé**.

Les lacunes mineures restantes pourront alors être documentées plutôt que prolonger indéfiniment le chantier.

---

# 14. Instruction de développement

Travailler sur la version source la plus récente.

Ne pas patcher uniquement le HTML généré.

Modifier les modules source concernés, puis :

```text
npm test
audit champs/choix
build autonome
tests ciblés D102G3
tests de non-régression
```

Ne pas toucher à D103 pendant ce lot.
