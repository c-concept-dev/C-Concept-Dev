# Prompts Templates - C Concept&Dev

Ce dossier contient les **templates de prompts universels** pour créer votre clone.

---

## 📄 Fichiers

### 1. `prompt-instructions.txt` (Court)

**Taille** : ~8000 caractères  
**Usage** : Prompt principal, instructions condensées  
**Compatible** : Tous LLM (ChatGPT, Claude, Gemini, Grok, etc.)

**Contenu** :
- Identité du clone
- Sources de données (Brain, Persona, megasearch)
- Style de réponse
- Règles comportementales
- Ce qu'il faut faire / ne pas faire

**📋 Limite caractères par LLM :**
- **ChatGPT** : ~8000 caractères (Custom GPT Instructions)
- **Claude** : Illimité (Custom Instructions)
- **Gemini** : ~32000 caractères (Gems)
- **Grok** : ~10000 caractères

---

### 2. `prompt-detailed.html` (Long)

**Taille** : ~60 KB (~50 000 mots)  
**Usage** : Coordinateur central ultra-détaillé  
**Format** : HTML stylé et navigable

**Contenu** :
- 8 sections complètes
- Tableaux de calibration Big Five
- Workflows opérationnels
- Exemples concrets pour chaque cas
- Checklist qualité
- Navigation interactive

**📖 Sections :**
1. 🎯 Identité fondamentale
2. 🧠 Sources de données (Brain, Persona, Knowledge)
3. 🎭 Incarner la personnalité (Big Five détaillé)
4. 💬 Style de communication (8 styles)
5. 📚 Utilisation des connaissances
6. 🚦 Règles comportementales
7. ⚙️ Workflows opérationnels
8. ✅ Métriques de qualité

---

## 🚀 Comment Utiliser

### Étape 1 : Personnaliser les Templates

**Remplacer les placeholders :**
- `[NOM]` → Votre nom complet
- `[NOM COMPLET]` → Votre nom + prénom
- `[DOMAINE]` → Votre domaine d'expertise (ex: musique, cuisine, médecine)
- `[STYLE]` → Votre style de communication (ex: Direct, Diplomatic, etc.)
- `[SCORE%]` → Vos scores Big Five réels (depuis Brain.json)
- `[VALEUR 1/2/3]` → Vos top 3 Schwartz Values

### Étape 2 : Uploader dans votre LLM

#### Pour ChatGPT (Custom GPT)
```
1. Create Custom GPT
2. Instructions → Coller prompt-instructions.txt personnalisé
3. Knowledge → Uploader Brain.json + Persona.json + megasearch.json
4. Conversation starters (optionnel)
5. Save
```

#### Pour Claude (Custom Instructions)
```
1. Settings > Custom Instructions
2. Coller prompt-instructions.txt
3. Uploader Brain.json en pièce jointe
4. Uploader Persona.json en pièce jointe
5. Uploader megasearch.json en pièce jointe
```

#### Pour Gemini (Gems)
```
1. Create Gem
2. Instructions → Coller prompt-instructions.txt
3. Uploader Brain.json
4. Uploader Persona.json
5. Uploader megasearch.json
```

---

## 📝 Conseils de Personnalisation

### prompt-instructions.txt

**Adaptez ces sections :**
- **Style de communication** (ligne ~65) → Mettez votre style réel
- **Longueur des réponses** (ligne ~85) → Ajustez selon vos préférences
- **Limites connaissances** (ligne ~125) → Soyez honnête sur ce que vous ne savez pas

### prompt-detailed.html

**Pour une personnalisation avancée :**
1. Ouvrir dans un éditeur HTML
2. Chercher `[NOM]` et remplacer partout
3. Remplir les tableaux Big Five avec vos scores réels
4. Ajouter vos anecdotes personnelles dans les exemples
5. Adapter les workflows à votre domaine

---

## 🎯 Workflow Recommandé

```
1. Générer Brain.json (Clone Interview Pro)
2. Créer Persona.json (Persona Builder ou manuel)
3. Créer megasearch.json (Knowledge Base)
4. Personnaliser prompt-instructions.txt
5. Personnaliser prompt-detailed.html (optionnel)
6. Uploader le tout dans votre LLM préféré
7. Tester et ajuster
```

---

## ✅ Checklist de Validation

Avant d'uploader, vérifiez :

- [ ] Tous les `[PLACEHOLDERS]` sont remplacés
- [ ] Scores Big Five correspondent à votre Brain.json
- [ ] Style de communication correspond à votre profil
- [ ] Anecdotes Persona.json sont pertinentes
- [ ] megasearch.json contient vos vraies connaissances
- [ ] Pas d'informations confidentielles sensibles

---

## 🔄 Mise à Jour

Les prompts doivent évoluer avec vos JSON :

**Quand mettre à jour :**
- Nouveau Brain.json (nouvelle interview) → Ajuster scores Big Five
- Nouveau Persona.json (événement vie) → Ajouter anecdotes
- Nouveau megasearch.json (nouvelles connaissances) → Mentionner expertise

**Fréquence recommandée :**
- Brain.json : 1x/an (interview complète)
- Persona.json : À chaque événement marquant
- megasearch.json : Continu (nouvelles formations/livres)
- Prompts : 1x/trimestre (révision générale)

---

## 💡 Tips Pro

### Optimiser la Cohérence

**Astuce 1 : Calibration Big Five**
Si votre Openness est 75%, UTILISEZ cette info activement :
```
"Je suis quelqu'un de très ouvert (Openness 75%), donc j'adore explorer..."
```

**Astuce 2 : Schwartz Values**
Référencez vos valeurs dans vos opinions :
```
"Vu que Self-direction est ma valeur #1, je privilégie l'autonomie..."
```

**Astuce 3 : Communication Style**
Soyez explicite sur votre style :
```
"Mon style est Direct - donc franchement, je pense que..."
```

### Éviter les Incohérences

❌ **Mauvais** : Brain.json dit Extraversion 30%, mais prompt dit "J'adore les grandes réunions !"  
✅ **Bon** : "Je suis plutôt introverti (Extraversion 30%), donc je préfère les petits groupes."

❌ **Mauvais** : Persona.json dit diplôme médecine, mais prompt dit "Je ne connais pas grand-chose en santé"  
✅ **Bon** : "Avec mes 20 ans d'expérience médicale, je peux te dire que..."

---

## 🆘 Troubleshooting

**Problème** : Le clone ne semble pas "moi"  
**Solution** : Vérifier cohérence Brain.json ↔ prompt. Ajuster les scores Big Five.

**Problème** : Le clone invente des infos  
**Solution** : Renforcer la section "Ne jamais inventer" dans le prompt.

**Problème** : Le clone est trop générique  
**Solution** : Ajouter plus d'anecdotes de Persona.json. Citer plus de sources de megasearch.json.

**Problème** : Le clone dit "En tant qu'IA..."  
**Solution** : Renforcer la section "Phrases interdites" + Tester plusieurs fois jusqu'à extinction.

---

## 📚 Ressources

- **Brain.json** : Généré par [Clone Interview Pro](../tools/clone-interview-pro/)
- **Persona.json** : Créé via [Persona Builder](../tools/persona-builder/) (futur)
- **megasearch.json** : Créé via [Knowledge Base Template](../templates/knowledge-base-template/)

---

**Auteur** : Christophe BONNET - C Concept&Dev  
**Version** : 1.0.0  
**License** : Proprietary

---

*"Des prompts bien calibrés = Un clone fidèle."* 🎯
