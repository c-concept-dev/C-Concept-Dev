# Tesseract sur l'intégration continue : voie 1 maintenant, voie 3 ensuite

**Décidé par Christophe le 9 novembre 2026**, dans la fenêtre de la session. Ses mots :

> « Tesseract sur la CI : voie 3, version légère. Publier une fois le Tesseract exact de
> l'application (binaire + leptonica + fichiers de langue) comme archive de release GitHub, avec
> son empreinte sha256 dans `fixtures/moteurs-de-lecture.json` ; la CI la télécharge, vérifie
> l'empreinte, et lit avec. Propose-moi le plan avant de publier quoi que ce soit (une release est
> publique). En attendant : voie 1 (pas de Tesseract sur la CI de la branche de travail). »

> « Publication de l'archive : plus tard, sur mon mot explicite, après l'étape 0 et après m'avoir
> soumis l'archive et son empreinte. »

Deux temps, donc. **Voie 1, en vigueur** : aucun Tesseract sur l'intégration continue de la branche
de travail ; les contrôles qui lisent des pages s'y sautent, et le saut dit sa raison. **Voie 3, à
venir** : l'archive des moteurs devient un artefact de release, son empreinte entre dans la
fixture, et l'intégration continue lit avec **le même programme** que l'application.

La publication de la release est une **porte de Christophe**, deux fois : le plan avant toute
publication, puis l'archive et son empreinte soumises avant qu'elle ne parte. Une recommandation
n'est pas une autorisation.

## La raison

Le coureur installerait par Homebrew un Tesseract qui n'est pas celui de l'application — mesuré le
9 novembre : **5.5.4 / 1.87.0** contre **5.5.1 / 1.86.0**. Un contrôle de lecture vert sur le
coureur ne dirait alors rien de ce que l'application lit, et un contrôle qui rassure sans rien
établir est pire qu'un contrôle absent. Voir
[le programme de lecture compte autant que ses langues](2026-11-08-le-programme-de-lecture-compte-autant-que-ses-langues.md).

Une voie intermédiaire a été essayée et **retirée par la mesure** : installer Tesseract sur le
coureur et y faire tourner les 92 contrôles de lecture. La branche d'essai `wip/essai-ocr-ci` l'a
mesurée le 9 novembre — `voie-oracle.test.ts` met **793 s** sur le coureur contre 852 s ici, et son
plus lent contrôle 58 027 ms pour un délai de 180 000, soit une marge de **×3,10**. La lenteur
n'était donc pas l'obstacle ; la divergence des versions l'est. La branche a été supprimée après
conservation de son journal brut.

## Ce que cela remplace

Le lot 0b de la file (« installer Tesseract et ses langues sur les machines de la CI »), qui est
**absorbé** par la dernière case de l'étape 0 du cahier de pilotage.
