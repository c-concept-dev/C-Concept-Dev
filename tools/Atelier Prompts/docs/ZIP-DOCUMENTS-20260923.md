# ZIP de pièces jointes — 23 septembre 2026

Le ZIP est un mode de dépôt multiple facultatif. Il ne modifie ni OPRIE, ni les
modèles, ni le Worker, ni la capacité totale de texte analysable.

## Fonctionnement

- Ouverture entièrement locale, sans écriture des fichiers sur disque ni exécution.
- Liste des documents avec nom du ZIP et chemin interne ; chaque pièce peut être retirée.
- Lecture par le lecteur documentaire existant (PDF, Word, HTML, Markdown, etc.).
- Aucune ingestion automatique de réponse IA provenant d'un JSON dans le ZIP.
- Le bouton Préparer confirme l'utilisation des pièces après inspection de la liste.
- Fichiers non lisibles et ZIP imbriqués visibles en erreur : aucun appel du pilote
  tant qu'une pièce du tour reste incomplète. Exclusion uniquement par la personne.
- Métadonnées `.DS_Store`, `__MACOSX`, `._*`, `Thumbs.db` ignorées et inventoriées.

## Protections

40 Mio compressés, 64 Mio décompressés au total, 40 Mio par membre, 100 fichiers,
200 entrées (dossiers compris). Les limites documentaires et de transport restent
inchangées. Une archive compressée ne permet pas de contourner le budget d'analyse.

Contrôle préalable du répertoire central et des en-têtes locaux, puis contrôle
des tailles réellement produites pendant la décompression et du CRC de chaque
document. Aucune importation partielle si l'intégrité de l'archive échoue.
Décompression par petites tranches avec points d'annulation et restitution de la
main au navigateur. Pas d'allocation fondée uniquement sur une taille déclarée.

Refus explicite des ZIP chiffrés, ZIP64, multi-volumes, liens symboliques, chemins
traversants/absolus, noms dupliqués ou non UTF-8, compression autre que Store/Deflate,
entrées superposées et fichiers corrompus. Un ZIP imbriqué n'est jamais ouvert.

## Preuves

18 tests dédiés couvrent le parseur, les limites, les tailles falsifiées, le CRC,
les noms, l'annulation, l'importation atomique et la vraie fonction `addFiles`.
Le pilote réel est également exécuté avec une pièce ZIP non lisible : zéro appel
Fast et zéro appel profond. Les tests ne nécessitent aucun appel fournisseur.

Contrôle navigateur local : archive Markdown + HTML + DOCX, trois textes lus,
chemins conservés, métadonnée macOS signalée. Une seconde archive avec DOC ancien
et ZIP imbriqué affiche les deux erreurs et empêche le lancement d'Architecte.

Les archives d'essai sont temporaires et ne sont pas ajoutées au dépôt.
