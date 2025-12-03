# Knowledge Base Template - C Concept&Dev

**Template vierge pour créer votre base de connaissances personnelle**

---

## 🎯 Qu'est-ce qu'une Knowledge Base ?

C'est la **mémoire externe** de votre clone - tout ce que vous savez, maîtrisez, ou avez étudié.

**Contenu typique :**
- 📚 Livres lus / Méthodes maîtrisées
- 🎓 Formations suivies
- 💼 Compétences professionnelles
- 🧪 Expériences pratiques
- 📖 Concepts théoriques
- 🎯 Exercices / Recettes / Protocoles

**Output final** : `megasearch.json` (~6.6 Mo typique)

---

## 📂 Structure Recommandée

```
knowledge-base-template/
├── Category-1/                  # Ex: Musique, Cuisine, Médecine
│   ├── Subcategory-A/
│   │   ├── Book-1/
│   │   │   ├── assets/
│   │   │   │   └── pages/
│   │   │   │       ├── page_001.png
│   │   │   │       ├── page_002.png
│   │   │   │       └── ...
│   │   │   ├── index.html       # Moteur de recherche (optionnel)
│   │   │   ├── songs_index.json # OU content.json
│   │   │   └── README.md
│   │   └── Book-2/
│   └── Subcategory-B/
├── Category-2/
├── automation/                  # Scripts pour générer megasearch.json
│   ├── collect-all.py
│   ├── merge-to-megasearch.py
│   └── validate.py
├── megasearch.json             # ← OUTPUT FINAL
└── README.md
```

---

## 🎸 Exemple Concret : Prof de Basse (Musique)

```
Prof-de-Basse/  (Exemple réel de Christophe)
├── Methodes/
│   ├── Jazz-Bass/
│   │   ├── assets/pages/
│   │   ├── songs_index.json
│   │   └── index.html
│   └── Funk-Bass/
├── Real_Books/
│   ├── Real-Book-Vol-1/
│   │   ├── assets/pages/
│   │   └── songs_index.json
│   └── Real-Book-Vol-2/
├── Theorie/
│   ├── Harmonie/
│   └── Arpeges/
├── automation/
│   ├── generate-megasearch-unified.py
│   └── mega-scanner.py
└── megasearch.json  (6.6 Mo - 5247 ressources)
```

**Points clés** :
- Chaque livre = 1 dossier
- Pages scannées dans `assets/pages/`
- Index JSON pour recherche rapide
- Scripts automation pour générer megasearch.json

---

## 🚀 Comment Utiliser ce Template

### Étape 1 : Copier le Template

```bash
cp -r templates/knowledge-base-template my-knowledge-base
cd my-knowledge-base
```

### Étape 2 : Créer Vos Catégories

**Renommez selon votre domaine :**
- `Category-1/` → `Musique/` ou `Cuisine/` ou `Médecine/`
- `Subcategory-A/` → `Methodes/`, `Recettes/`, `Protocoles/`

**Exemples par domaine :**

#### 🎸 Musicien
```
Musique/
├── Methodes/
├── Partitions/
├── Théorie/
└── Exercices/
```

#### 👨‍🍳 Chef Cuisinier
```
Cuisine/
├── Recettes/
├── Techniques/
├── Ingredients/
└── Livres-Cuisine/
```

#### 👨‍⚕️ Médecin
```
Medecine/
├── Protocoles/
├── Pathologies/
├── Medicaments/
└── Formations/
```

### Étape 3 : Ajouter Votre Contenu

**Pour chaque livre/formation/ressource :**

1. **Créer un dossier**
   ```bash
   mkdir -p Musique/Methodes/Jazz-Bass
   ```

2. **Ajouter pages scannées** (si applicable)
   ```bash
   mkdir -p Musique/Methodes/Jazz-Bass/assets/pages
   # Copier vos pages PNG
   ```

3. **Créer l'index JSON**
   ```json
   {
     "metadata": {
       "bookTitle": "Jazz Bass Method",
       "author": "John Doe",
       "category": "musique",
       "style": "jazz"
     },
     "content": {
       "songs": [
         {
           "title": "Blue Bossa",
           "page": 12,
           "key": "Cm",
           "difficulty": "intermediate"
         }
       ],
       "exercises": [
         {
           "title": "Walking Bass Exercise 1",
           "page": 5,
           "difficulty": "beginner",
           "technique": "walking"
         }
       ]
     }
   }
   ```

### Étape 4 : Générer megasearch.json

```bash
# Installer dépendances Python
pip install -r requirements.txt

# Collecter tous les JSON
python automation/collect-all.py

# Fusionner en megasearch.json
python automation/merge-to-megasearch.py

# Valider la structure
python automation/validate.py
```

**Résultat** : `megasearch.json` prêt à uploader dans votre LLM ! ✅

---

## 📊 Format JSON Détaillé

### Structure d'un Item de Connaissance

```json
{
  "id": "jazz-bass_song_12",
  "type": "song",
  "title": "Blue Bossa",
  "page": 12,
  "url": "https://github.com/username/repo/assets/pages/page_012.png",
  "metadata": {
    "book": "Jazz Bass Method",
    "category": "musique",
    "style": "jazz",
    "key": "Cm",
    "difficulty": "intermediate",
    "has_mp3": false
  },
  "searchText": "blue bossa jazz bass cm intermediate"
}
```

### Types de Content Supportés

- `song` : Morceau de musique
- `exercise` : Exercice pratique
- `recipe` : Recette de cuisine
- `procedure` : Protocole médical
- `text` : Texte théorique
- `concept` : Concept à expliquer
- `reference` : Référence bibliographique

---

## 🛠️ Scripts Automation

### collect-all.py

**Rôle** : Scanner tous les dossiers et trouver les JSON

```python
#!/usr/bin/env python3
"""Scanne knowledge-base/ et collecte tous les JSON"""

import json
from pathlib import Path

def scan():
    knowledge_dir = Path('.')
    json_files = list(knowledge_dir.glob('**/*_index.json'))
    
    items = []
    for jf in json_files:
        with open(jf, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Traiter data...
            items.extend(data['content']['songs'])
            items.extend(data['content']['exercises'])
    
    with open('collected-items.json', 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    
    print(f"✅ {len(items)} items collectés")

if __name__ == '__main__':
    scan()
```

### merge-to-megasearch.py

**Rôle** : Fusionner tous les items en megasearch.json

```python
#!/usr/bin/env python3
"""Fusionne tous les items en megasearch.json"""

import json
from datetime import datetime

def merge():
    with open('collected-items.json', 'r', encoding='utf-8') as f:
        items = json.load(f)
    
    megasearch = {
        'metadata': {
            'version': '4.0',
            'generated_at': datetime.now().isoformat(),
            'total_resources': len(items)
        },
        'resources': items
    }
    
    with open('megasearch.json', 'w', encoding='utf-8') as f:
        json.dump(megasearch, f, ensure_ascii=False, indent=2)
    
    print(f"✅ megasearch.json créé : {len(items)} ressources")

if __name__ == '__main__':
    merge()
```

---

## 🎯 Workflow Complet

```
1. Copier template
   ↓
2. Créer structure catégories
   ↓
3. Ajouter contenu (livres, pages, JSON)
   ↓
4. Lancer collect-all.py
   ↓
5. Lancer merge-to-megasearch.py
   ↓
6. Valider megasearch.json
   ↓
7. Uploader dans LLM avec Brain + Persona
```

---

## ✅ Checklist Qualité

Avant de considérer votre Knowledge Base terminée :

- [ ] Structure cohérente (catégories claires)
- [ ] Tous les JSON suivent le même format
- [ ] Pages scannées en bonne résolution
- [ ] Index créés pour chaque livre/ressource
- [ ] megasearch.json généré sans erreurs
- [ ] Taille raisonnable (<10 Mo pour upload LLM)
- [ ] Pas d'informations confidentielles

---

## 💡 Tips Pro

### Optimiser la Recherche

**Astuce 1 : searchText optimisé**
```json
{
  "searchText": "blue bossa kenny dorham jazz standard cm minor blues"
}
```
Inclure : titre, compositeur, style, tonalité, mots-clés

**Astuce 2 : Tags multiples**
```json
{
  "tags": ["jazz", "standard", "bossa", "latin", "intermediate"]
}
```

**Astuce 3 : Hiérarchie catégories**
```json
{
  "category": "musique",
  "subCategory": "jazz",
  "subSubCategory": "bossa-nova"
}
```

### Gérer les Mises à Jour

**Nouvelle ressource ajoutée ?**
```bash
# Re-générer megasearch.json
python automation/merge-to-megasearch.py

# Valider
python automation/validate.py

# Uploader nouveau megasearch.json dans LLM
```

**Fréquence recommandée :**
- Continu si formation active
- 1x/mois sinon
- Avant chaque update majeure du clone

---

## 📚 Exemples par Domaine

### 🎸 Musicien (Voir /examples/prof-de-basse/)

- 5247 ressources
- Methodes, Real Books, Théorie
- ~6.6 Mo
- Scripts automation inclus

### 👨‍🍳 Chef Cuisinier (À venir)

Structure suggérée :
```
Cuisine/
├── Recettes/
│   ├── Francaise/
│   ├── Italienne/
│   └── Asiatique/
├── Techniques/
│   ├── Base/
│   └── Avancee/
└── Ingredients/
```

### 👨‍⚕️ Médecin (À venir)

Structure suggérée :
```
Medecine/
├── Protocoles/
├── Pathologies/
├── Medicaments/
└── Formations/
```

---

## 🆘 Troubleshooting

**Problème** : megasearch.json trop gros (>10 Mo)  
**Solution** : Compresser images, limiter champs JSON, paginer

**Problème** : Scripts automation ne marchent pas  
**Solution** : Vérifier Python 3.8+, installer dépendances

**Problème** : Clone ne trouve pas mes connaissances  
**Solution** : Vérifier searchText optimisé, ajouter tags

**Problème** : Formats JSON incohérents  
**Solution** : Utiliser les schemas dans `/schemas/knowledge.schema.json`

---

## 📖 Ressources

- **Schema JSON** : `/schemas/knowledge.schema.json`
- **Exemple complet** : `/examples/prof-de-basse/`
- **Scripts automation** : `/automation/`
- **Documentation** : `/docs/KNOWLEDGE-BASE-GUIDE.md`

---

**Auteur** : Christophe BONNET - C Concept&Dev  
**Version** : 1.0.0  
**License** : Proprietary

---

*"Une Knowledge Base bien structurée = Un clone expert dans son domaine."* 📚
