# Fiabilité des pièces jointes — 23 septembre 2026

## Cause confirmée et périmètre

Le lecteur précédent ne lisait que les fichiers textuels. Un PDF était enregistré
avec `text: ''` et `external: true`, sans extraction de son contenu. La limite
de 16 384 octets du corps Analyste/OPRIE empêchait également la transmission
intégrale d'un document textuel conséquent. Ce sont deux défauts distincts.
Ils ne constituent pas, seuls, une reproduction causale de tous les blocages
« Votre demande est analysée » observés par la personne.

## Correctif

- Extraction locale des PDF et des formats bureautiques courants ; OCR local
  français/anglais des images et pages PDF pauvres en texte.
- Aucun CDN, aucune clé ni transmission distante pendant la lecture.
- Aucun résumé ou découpage silencieux du texte ; refus explicite si trop long.
- Aucun appel Fast/OPRIE si une pièce du tour est en cours de lecture, illisible
  ou si le corps complet dépasse la capacité de transport.
- Conservation de la politique de provenance : documents de la personne et
  dernière réponse IA pour le tour ; historique conservé.
- Annulation lors du retrait/réinitialisation ; attente UI de lecture bornée.
- Entrée Analyste/OPRIE : 524 288 octets ; plafond absolu : 1 048 576 octets.
  Fast reste limité à 16 384 octets, Critique et Arbitre restent inchangés.
- Les mécanismes sémantiques OPRIE et les sept régions gelées ne changent pas.

Les tests historiques de transport ont été actualisés pour les nouvelles bornes,
sans réécrire les résultats des anciennes campagnes. Les tests de refus de
pièces manquantes vérifient désormais zéro appel, plutôt qu'un appel aveugle.

## Vérifications locales

- Suite : 3 715 tests, 3 714 réussis, 1 ignoré, 0 échec.
- Sept empreintes Frozen inchangées.
- Build Worker à blanc réussi ; comparaison du bundle avec la version active :
  seuls les plafonds de transport et le maintien du plafond Fast diffèrent.
- Les deux PDF fournis sont lus dans le navigateur local : 16 pages pour le
  référentiel et 2 pages de très grande hauteur pour la note de synthèse.
- Extraction intégrale des couches textuelles avec le lecteur réel :
  21 488 caractères / 22 562 octets UTF-8 pour le référentiel,
  46 816 caractères / 48 347 octets pour la note (marqueurs de page compris).
- OCR exécuté dans le navigateur sur une image de la première page du référentiel.
  Deux défauts d'intégration détectés pendant ce contrôle ont été corrigés :
  export ESM par défaut et chemin du binaire WASM relatif au worker OCR.
- Aucun PDF de la personne n'est inclus dans le dépôt ou envoyé à un fournisseur
  par ces vérifications locales.

## Limites explicites

Ce n'est pas un lecteur universel sans limite : 40 Mio par fichier, 300 pages
PDF, 180 000 caractères par document, 20 millions de pixels par image.
Les formats anciens DOC/XLS et les PDF protégés sont refusés explicitement.
Les schémas, graphiques et mises en page ne sont pas interprétés ; l'OCR peut
faire des erreurs. Les valeurs Excel sont celles enregistrées, sans recalcul
ni interprétation des formats de dates. Les documents dépassant la capacité
totale doivent être séparés par la personne, jamais tronqués automatiquement.

## Production

Version Worker déployée à 100 % : `6a33c072-3294-4692-8073-e65a7ad5de8d`.
Runtime relu via l'API Cloudflare et identique octet pour octet au bundle uploadé :
`321c6a1a5d7e72280a605439a025c29dc3011ff66971a46fb9eca63ce5094027`.
Version précédente conservée pour rollback : `9225e896-3e16-4ff9-9d20-3a3415c740fe`.
Test fournisseur réel sur cette candidate : demande orale synthétique + corps
de 96 102 octets, HTTP 200, `operational_request_ready`, 25 933 ms.
Le même serveur refuse un corps Fast de plus de 16 Kio (HTTP 413).
Ce test emploie un document synthétique, pas les PDF de la personne ; il valide
le transport et la décision distante, pas l'exécution finale avec une clé API
personnelle ni toutes les particularités des documents cliniques.
