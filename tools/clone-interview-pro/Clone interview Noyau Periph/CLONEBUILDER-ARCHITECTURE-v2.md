# CLONEBUILDER — ARCHITECTURE DU PROJET COMPLET

## Document de référence
**Version:** 2.0 — 15 mars 2026
**Auteur:** Christophe Bonnet / C Concept&Dev
**Principe directeur:** Système rigoureux, universel, intelligent, adaptatif, qui sait penser et raisonner.

---

## 1. VISION — UN CLONE EN 4 COUCHES

Un clone complet d'une personne repose sur 4 piliers distincts mais interconnectés :

```
COUCHE 1 — PERSONNALITÉ (qui je suis)
  Clone Interview Pro → brain_personality.json
  Entretien clinique structuré → Big Five, HEXACO, Young, DMRS,
  Attachement, Valeurs, Style linguistique, Patterns comportementaux

COUCHE 2 — CONNAISSANCES (ce que je sais)
  OCR Universel V14 → KP-CANON V3 → MegaBrain V6 → brain_knowledge.json
  Documents, livres, articles → concepts, entités, relations, glossaire
  La bibliothèque professionnelle et intellectuelle de la personne

COUCHE 3 — PERSONA (ce que j'ai vécu)
  [À CRÉER] Clone Persona → brain_persona.json
  Histoire de vie, souvenirs, anecdotes, récits, événements marquants
  La mémoire autobiographique structurée

COUCHE 4 — MÉMOIRE VIVANTE (comment j'évolue)
  [À CRÉER] Clone Memory → brain_memory.json
  Chaque interaction avec le clone enrichit sa mémoire
  Nouvelles informations, corrections, évolution des positions
  Le clone n'est pas figé — il apprend

SORTIE FINALE — CLONE COMPLET
  brain_personality.json + brain_knowledge.json + brain_persona.json + brain_memory.json
  = un clone déployable sur n'importe quel LLM (Claude, GPT, Gemini, Mistral)
```

### Outils existants et leur rôle

| Outil | Version | Rôle | Couche | Output |
|-------|---------|------|--------|--------|
| Clone Interview Pro | v17.3.15 | Entretien de personnalité | 1 | brain_personality.json + clone_prompt.txt |
| OCR Universel | V14.0.88c | Extraction OCR + KG depuis documents | 2 (input) | KP-CANON-1.0 ZIP |
| KP-CANON PromptFactory | V3-133 | Chunking + extraction structurée | 2 (processing) | KP-CANON-1.0 ZIP |
| MegaBrain | V6.1.1 | Compilation multi-docs en brain unifié | 2 (output) | brain_knowledge.json |
| Brain Clinical Report | v2 | Rendu PDF clinique depuis brain | 1 (visualisation) | PDF rapport clinique |
| Clone Persona | [À CRÉER] | Recueil d'histoire de vie | 3 | brain_persona.json |
| Clone Memory | [À CRÉER] | Mémoire évolutive | 4 | brain_memory.json |

---

## 2. SCHÉMA CLONE-BRAIN UNIFIÉ

Tous les fichiers brain_*.json partagent un header commun (schema CLONE-BRAIN-1.0) pour être interopérables :

```javascript
{
    _clone: {
        schema: 'CLONE-BRAIN-1.0',
        brain_type: 'personality' | 'knowledge' | 'persona' | 'memory',
        brain_id: 'christophe-bonnet',    // identifiant unique du clone
        version: '2.0',
        generated: '2026-03-15T...',
        generator: 'Clone Interview Pro v20'
    },
    _instructions: { /* spécifique à chaque brain_type */ },
    _schema: { /* documentation des champs */ },
    // ... données spécifiques
}
```

### 2.1 brain_personality.json (Couche 1 — Interview Pro)

```javascript
{
    _clone: { schema: 'CLONE-BRAIN-1.0', brain_type: 'personality' },
    identity: { display_name, age, occupation, self_description },
    portrait: {
        portrait_clinique,            // texte narratif
        architecture_cognitive,       // style de pensée
        paysage_emotionnel,          // vie émotionnelle
        identite_narrative,          // comment la personne se raconte
        rapport_a_lautre,            // style relationnel
        dynamique_profonde,          // moteurs et freins inconscients
        signatures_verbales,         // expressions caractéristiques
        contradictions_vivantes,     // tensions internes
        angles_morts,                // ce que la personne ne voit pas
        instructions_incarnation     // guide pour jouer le rôle
    },
    temperament: { /* Big Five + facettes + evidence */ },
    v19_personality: {
        hexaco, schemas, attachment, defenses,
        values, clinical, linguisticProfile,
        triangulation, responseBiases, debiasedProfile
    },
    communication_style: { /* registre, rythme, vocabulaire */ },
    thinking_patterns: { /* biais cognitifs, style décisionnel */ },
    emotional_profile: { /* réactivité, régulation, triggers */ },
    data_quality: { grade, completeness, warnings }
}
```

### 2.2 brain_knowledge.json (Couche 2 — MegaBrain) [EXISTE]

```javascript
{
    _clone: { schema: 'CLONE-BRAIN-1.0', brain_type: 'knowledge' },
    library: [/* docs avec priority 1-5 */],
    concepts: [/* id, label, def, importance, doc, ev, qa */],
    entities: [/* id, label, type, def, doc, ev */],
    relations: [/* source, target, type, label, confidence */],
    glossaire: { /* termes → définitions */ },
    themes: { /* regroupements thématiques */ },
    bridges: [/* liens inter-documents */ ],
    article_index: { /* index inversé pour lookup */ }
}
```

### 2.3 brain_persona.json (Couche 3 — À créer)

```javascript
{
    _clone: { schema: 'CLONE-BRAIN-1.0', brain_type: 'persona' },
    timeline: [
        { period: '1978-1996', label: 'Enfance et adolescence',
          events: [{ date, description, impact, emotions, people }] },
        { period: '1996-2010', label: 'Formation et premiers emplois', events: [...] },
        // ...
    ],
    relationships: {
        family: [{ name, role, quality, key_moments }],
        friends: [...],
        professional: [...],
        romantic: [...]
    },
    turning_points: [
        { date, event, before, after, meaning }  // moments charnières
    ],
    recurring_themes: [
        { theme: 'autonomie', manifestations: [...], evolution: '...' }
    ],
    places: [
        { name, period, significance, memories }
    ],
    anecdotes: [
        { context, story, what_it_reveals, tags }
    ],
    self_narrative: '...'  // comment la personne raconte sa propre histoire
}
```

### 2.4 brain_memory.json (Couche 4 — À créer)

```javascript
{
    _clone: { schema: 'CLONE-BRAIN-1.0', brain_type: 'memory' },
    interactions: [
        { date, context, key_learnings, corrections, new_facts }
    ],
    evolved_positions: {
        // positions qui ont changé depuis l'interview initiale
        topic: { original, current, reason, date_changed }
    },
    new_knowledge: [
        // informations acquises post-interview
        { fact, source, date, confidence }
    ],
    corrections: [
        // erreurs du clone corrigées par la personne
        { what_was_wrong, correction, date }
    ],
    personality_drift: {
        // évolutions de personnalité observées
        dimension: { original_score, current_estimate, evidence }
    }
}
```

---

## 3. CLONE INTERVIEW PRO v20 — REFONTE

### 3.1 Ce qui change avec le contexte CloneBuilder

Le Clone Interview n'est pas un outil thérapeutique isolé. C'est la **Partie 1** d'un système de clonage complet. Cela change la perspective sur plusieurs points :

1. **Le brain_personality.json est consommé en aval** — par le Brain Clinical Report, mais aussi par un futur assembleur qui combine les 4 brain_*.json en un clone déployable. Le format doit donc être stable, documenté, et interopérable avec le schema CLONE-BRAIN-1.0.

2. **L'entretien capture aussi du matériau pour la Partie 3 (Persona)** — les récits de vie, anecdotes, souvenirs d'enfance récoltés pendant l'interview sont de la matière autobiographique. Aujourd'hui ces données sont perdues dans le transcript. Il faut les extraire et les structurer.

3. **La qualité du profil conditionne tout le clone** — un clone avec un excellent brain_knowledge mais un brain_personality médiocre aura le bon vocabulaire mais la mauvaise personnalité. L'interview est le maillon critique.

4. **La Mémoire Vivante (Partie 4) implique la re-jouabilité** — le clone doit pouvoir être ré-interviewé pour affiner/corriger son profil. L'interview n'est pas un one-shot.

### 3.2 Architecture fichiers

```
clone-core.js              — Moteur (conversation, analyseurs, mémoire)
clone-multimodal.js        — Audio/Vidéo/Fusion (optionnel)
clone-brain-builder.js     — Export brain_personality.json + persona extraction

clone-interview.html       — Entretien complet (vidéo + audio)
clone-text.html            — Entretien texte seul
clone-express.html         — Entretien court (20 min)
clone-update.html          — Re-interview pour mise à jour (Partie 4)
```

### 3.3 Nouveauté : Extraction Persona pendant l'interview

Pendant l'entretien, chaque réponse est analysée non seulement pour la personnalité mais aussi pour les éléments autobiographiques :

```javascript
class PersonaExtractor {
    // Détecte et structure les éléments d'histoire de vie
    extractFromResponse(text, question, context) {
        return {
            events: this.detectEvents(text),        // "quand j'avais 15 ans..."
            people: this.detectPeople(text),         // "ma mère", "mon ami Marc"
            places: this.detectPlaces(text),         // "à Toulouse", "à l'hôpital"
            anecdotes: this.detectAnecdotes(text),   // récits structurés
            emotions: this.detectEmotionalContext(text),
            timeline_hints: this.detectTimeReferences(text)
        };
    }
}
```

Le brain_builder collecte ces fragments et les assemble en un `brain_persona_draft.json` inclus dans le ZIP d'export — pas un persona complet, mais un premier matériau structuré que la Partie 3 viendra enrichir.

### 3.4 Module de re-interview (clone-update.html)

```javascript
window.CLONE_VARIANT = {
    mode: 'update',
    existingBrain: null,  // chargé au démarrage
    // L'interview se concentre sur :
    // 1. Les zones à faible confiance du brain existant
    // 2. Les corrections signalées par la mémoire vivante
    // 3. L'exploration de nouvelles dimensions
};
```

---

## 4. PIPELINE DE SORTIE — Brain v2

### Format brain_personality.json v2

Voir section 2.1 ci-dessus. Points critiques :

- **Confiance calibrée** par dimension : chaque score a un `confidence` traçable
- **Evidence chain** : chaque affirmation est reliée au verbatim exact (question + réponse)
- **Interopérabilité CLONE-BRAIN-1.0** : header commun avec brain_knowledge.json
- **Persona draft inclus** : les éléments autobiographiques détectés pendant l'interview
- **Quality gate** : `data_quality.grade` calculé automatiquement (A/B/C/D/F)

### Quality Gate — critères de grade

| Grade | Completeness | Conditions |
|-------|-------------|------------|
| A | > 85% | Tous les piliers mandatory > 75%, confiance moyenne > 0.75 |
| B | 70-85% | Au plus 1 pilier mandatory < 75% |
| C | 55-70% | 2+ piliers mandatory < 75% |
| D | 40-55% | Données exploitables mais incomplètes |
| F | < 40% | Clone non fiable — ré-interview nécessaire |

---

## 5. PROMPT CLINIQUE v20

### Positionnement

Le prompt n'est pas celui d'un thérapeute. C'est celui d'un **expert en profilage de personnalité** dont l'objectif est de capturer assez de matière pour construire un clone fidèle.

### Posture recadrée

```
Tu es un expert en psychologie de la personnalité menant un entretien
structuré de profilage. Ton objectif : capturer suffisamment de matière
pour construire un clone digital fidèle de cette personne.

Tu n'es pas un thérapeute — tu ne soignes pas. Tu es un portraitiste
du psychisme : tu observes, tu questionnes, tu vérifies, tu nuances.
Ton travail sera jugé sur la FIDÉLITÉ du clone produit — est-ce que
quelqu'un qui connaît cette personne la reconnaîtrait dans le clone ?

Pour cela tu as besoin de :
— Comment cette personne PENSE (architecture cognitive, style décisionnel)
— Comment cette personne RESSENT (vie émotionnelle, triggers, régulation)
— Comment cette personne SE RACONTE (identité narrative, mythes personnels)
— Comment cette personne SE COMPORTE (patterns, habitudes, réactions)
— Comment cette personne SE RELIE AUX AUTRES (attachement, conflits, intimité)
— Ce que cette personne NE VOIT PAS D'ELLE-MÊME (angles morts, défenses)
— L'HISTOIRE qui a produit cette personne (persona — événements, personnes clés)
```

### Les 5 couches (adaptées du thérapeute au portraitiste)

1. **Séquence de raisonnement silencieuse** — avant chaque question : quel pilier est le plus faible ? quelle information manque pour un clone fidèle ?

2. **Triage dimensionnel** — orienté complétude du clone, pas diagnostic clinique

3. **Anti-patterns** — identiques (écho miroir interdit, question catalogue interdite, etc.)

4. **Capture autobiographique** — chaque récit de vie est du matériau Persona en plus de matériau Personnalité. Double extraction.

5. **Conscience de la complétude** — à partir de 75%, tisser les liens, vérifier les hypothèses, proposer un portrait oral que la personne valide ou corrige.

---

## 6. ORDRE DE MIGRATION

### Phase 1 — clone-core.js (sessions 1-3)
Extraction du monolithe. Toutes les classes dans un JS unique structuré.
Quick wins immédiats : temperature 0.75, déduplications TTS, post-processing renforcé.

### Phase 2 — clone-multimodal.js (sessions 4-5)
Module optionnel Audio/Vidéo avec contrat d'interface.

### Phase 3 — clone-brain-builder.js + Brain v2 (sessions 6-7)
Nouveau format brain_personality.json v2 avec confiance calibrée, evidence chain, persona draft, quality gate. Interopérable CLONE-BRAIN-1.0.

### Phase 4 — Prompt v20 + PersonaExtractor (session 8)
Posture portraitiste (pas thérapeute). 5 couches. Extraction autobiographique.

### Phase 5 — Variantes + clone-update (sessions 9-10)
clone-text.html, clone-express.html, clone-update.html (re-interview).

### Phase 6 — Clone Assembler (futur)
Outil qui combine les 4 brain_*.json en un clone déployable avec un mega-prompt optimisé pour chaque plateforme LLM cible.

---

## 7. CONVENTIONS

- Schema : `CLONE-BRAIN-1.0` — header commun obligatoire
- Fichiers : `clone-*.js`, `clone-*.html`
- Brain outputs : `brain_personality.json`, `brain_knowledge.json`, `brain_persona.json`, `brain_memory.json`
- Pas d'emoji dans le code
- Worker URL : `clone-proxy.11drumboy11.workers.dev`
- Auteur : C Concept&Dev
- Git : `c-concept-dev/C-Concept-Dev`

---

## 8. ÉTAT D'AVANCEMENT (15 mars 2026)

### Phases complétées

| Phase | Statut | Détail |
|-------|--------|--------|
| Phase 1 | FAIT | Extraction monolithe → 4 fichiers, temperature 0.75, model unifié |
| Phase 2 | FAIT | 27 fonctions UI/session migrées, doublons supprimés |
| Prompt v20 | FAIT | Séquence raisonnement 5 étapes, 7 experts, méta-cognition |
| Phase 3 | FAIT | Brain JSON v2 CLONE-BRAIN-1.0, confiance calibrée, persona draft |
| Phase 5 | FAIT | clone-update.html — re-interview ciblée zones faibles |

### Fichiers livrés

| Fichier | Lignes | Rôle |
|---------|--------|------|
| clone-core.js | 14081 | Moteur + analyseurs + prompt v20 + UI |
| clone-multimodal.js | 6265 | Audio/Vidéo/Fusion + initMLModules |
| clone-brain-builder.js | 8993 | Brain JSON v2 + export ZIP + PersonaExtractor |
| clone-interview.html | 2314 | Entretien complet |
| clone-update.html | 2493 | Re-interview ciblée (mémoire vivante) |

### Phase 6 (futur)
Clone Assembler — combine brain_personality + brain_knowledge + brain_persona + brain_memory en un clone déployable.
