# Contrats de données

Les schémas JSON du dossier `schemas/` sont normatifs pour le pilote.

## Identifiants

- Projet : `bdp_<uuid>`
- Personnage : `char_<uuid>`
- Lieu : `place_<uuid>`
- Page : `page_<nombre sur 3 chiffres>`
- Case : `panel_<page>_<ordre>`
- Image : `asset_<uuid>`
- Référence source : `src_<uuid>`

Les identifiants ne dépendent jamais du nom visible d’une personne.

## Statuts communs

```text
DRAFT → READY_FOR_REVIEW → APPROVED
                         ↘ REJECTED → DRAFT
APPROVED → STALE si une dépendance validée change
```

## Source narrative

Chaque case contient au moins une référence :

```json
{
  "kind": "chapter_excerpt",
  "sourceId": "src_...",
  "chapterIndex": 0,
  "quote": "Extrait court permettant l’audit",
  "start": 120,
  "end": 284,
  "interpretation": "Ce que la case rend visible",
  "fictionLevel": "ATTESTED"
}
```

Valeurs de `fictionLevel` :

- `ATTESTED`
- `PLAUSIBLE_RECONSTRUCTION`
- `DECORATIVE_ONLY`
- `UNRESOLVED`

Une case `UNRESOLVED` ne peut pas être approuvée.

## Texte de case

Le texte reste séparé de l’image :

```json
{
  "type": "speech",
  "speakerId": "char_...",
  "text": "…",
  "order": 1,
  "placement": { "x": 0.68, "y": 0.12, "w": 0.26, "h": 0.18 }
}
```

Types : `speech`, `thought`, `caption`, `sound_effect`.

## Asset image

```json
{
  "id": "asset_...",
  "panelId": "panel_001_01",
  "version": 3,
  "status": "APPROVED",
  "backend": "manual_chatgpt",
  "prompt": "…",
  "negativeInstructions": ["no text", "no watermark"],
  "referenceAssetIds": ["asset_ref_..."],
  "file": { "name": "panel_001_01_v3.png", "sha256": "…" },
  "createdAt": "2026-11-13T12:00:00Z",
  "review": { "reviewer": "…", "decision": "APPROVED", "comment": "…" }
}
```

## Obsolescence

Changer un élément entraîne :

- description d’un personnage → images qui l’utilisent `STALE` ;
- storyboard d’une case → image de la case `STALE` ;
- dialogue seul → image inchangée, mise en page `STALE` ;
- texte source → adaptation, storyboard, images et export `STALE` ;
- palette → toutes les images `STALE`, sauf dérogation humaine explicite.

