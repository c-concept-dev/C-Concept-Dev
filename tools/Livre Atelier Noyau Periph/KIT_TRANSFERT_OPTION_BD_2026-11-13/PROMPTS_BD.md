# Prompts de travail — Option BD

Ces gabarits sont des contrats de sortie. Les réponses structurées doivent être validées par schéma avant usage.

## 1. Adaptation d’un chapitre

```text
Tu es scénariste de bande dessinée et biographe.

Tu adaptes le chapitre fourni sans ajouter de fait constitutif absent de la matière.
Tu peux condenser, déplacer et rendre visible une mécanique attestée, mais tu ne peux pas créer une relation, un événement ou une psychologie nouvelle.

Pour chaque scène, retourne uniquement un JSON contenant :
- id
- source_excerpts
- fonction_narrative
- lieu
- periode
- personnages
- action_visible
- tension
- dialogues_candidats
- recitatifs_candidats
- elements_sensibles
- reconstruction_level
- questions_humaines

Si une scène ne peut pas être représentée sans invention, indique UNRESOLVED.
```

## 2. Bible visuelle

```text
Construis une proposition de bible visuelle à partir des seules descriptions fournies.

N’infère pas l’origine, la santé, la religion, l’orientation, la classe sociale ou toute autre caractéristique sensible non explicitement fournie.

Pour chaque personnage :
- traits explicitement attestés
- traits laissés ouverts
- apparence par période
- vêtements attestés ou neutres
- gestes récurrents
- éléments à préserver
- éléments interdits
- références nécessaires
- questions à faire valider

Retourne uniquement un JSON conforme au contrat demandé.
```

## 3. Storyboard

```text
Découpe la scène validée en pages et cases.

Contraintes :
- 2 à 6 cases par page ;
- chaque case montre une action ou une information nouvelle ;
- aucun récitatif ne répète ce que l’image montre ;
- les dialogues restent courts ;
- chaque case cite sa source narrative ;
- alterne plans d’ensemble, plans moyens et gros plans selon le rythme ;
- n’ajoute aucun texte dans le prompt d’image ;
- toute ambiguïté factuelle reste signalée.

Retourne uniquement un JSON conforme au schéma storyboard.
```

## 4. Référence de personnage

```text
Dessine une planche de référence originale pour un personnage de roman graphique.

Identité visuelle à conserver :
{{CHARACTER_DESCRIPTION}}

Présenter sans texte :
- vue de face ;
- trois quarts ;
- profil ;
- silhouette en pied ;
- expressions neutre, joie contenue, inquiétude et colère contenue.

Style : {{STYLE_BIBLE}}
Palette : {{PALETTE}}
Fond simple et uniforme.

Ne pas ajouter : texte, logo, filigrane, accessoires non demandés, autre personnage.
```

## 5. Image d’une case

```text
Dessine une case de bande dessinée originale, sans texte.

SCÈNE
{{VISIBLE_ACTION}}

COMPOSITION
- plan : {{SHOT}}
- angle : {{ANGLE}}
- cadrage : {{FRAMING}}
- lumière : {{LIGHTING}}
- continuité spatiale : {{CONTINUITY}}

PERSONNAGES DE RÉFÉRENCE
{{CHARACTER_REFERENCES}}

Préserver exactement les visages, proportions, âges apparents, coiffures et signes distinctifs validés dans les références. Adapter uniquement pose, expression et vêtements explicitement demandés.

STYLE
{{STYLE_BIBLE}}

INTERDITS
- aucun texte ;
- aucune bulle ;
- aucune onomatopée ;
- aucun logo ni filigrane ;
- aucun personnage supplémentaire ;
- aucun objet symbolique non demandé ;
- aucune modification de l’identité des personnages.
```

## 6. Correction locale

```text
Édite l’image existante.

Modification unique : {{CHANGE_REQUEST}}

Conserver strictement tout le reste : personnages, visage, âge, morphologie, décor, cadrage, lumière, palette, perspective et style.

Ne rien ajouter. Aucun texte, logo ou filigrane.
```

## 7. Revue de fidélité

```text
Compare la description de la case, sa source autobiographique, la bible validée et le compte rendu humain de l’image.

Classe chaque écart :
- OK
- COSMETIC
- CONTINUITY_ERROR
- FACTUAL_RISK
- SENSITIVE_INFERENCE
- HUMAN_REVIEW_REQUIRED

Ne valide jamais une ressemblance visuelle à partir du texte seul. Cette décision appartient à l’humain.
```

