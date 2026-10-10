# SnapDOM — copie locale épinglée

| | |
|---|---|
| Version | **3.3.0** |
| Licence | MIT |
| Fichier | `vendor/snapdom.mjs` |
| Taille | 264 613 octets |
| SHA-256 | `0932f35f12bc0137f9857cc965949d69afb986333fd5884c0ffeaf922bc932e9` |

**Pourquoi une copie locale et non un CDN.** L'atelier doit fonctionner hors ligne une fois la page
chargée (exigence non fonctionnelle « Hors ligne » du CDC v2), et une capture d'image doit donner le
même résultat demain qu'aujourd'hui. Une version flottante changerait la netteté du texte sans que
rien ne le signale.

**Pourquoi cette version.** C'est celle sur laquelle les mesures du lot 0 ont été faites : 52 à
61 ms par image, netteté 92,5 contre 162,5 pour le rendu natif, soit l'équivalent d'un flou
d'environ 1 px. Changer de version invaliderait ces mesures.

Le même fichier, au même octet, sert les bancs d'essai du lot 0
(`bancs-essai-atelier/vendeur/snapdom.mjs`) : une seule version dans tout le dépôt.

**Qui vérifie, et quand.** `tests/verify-atelier-images.cjs` recalcule le SHA-256 du fichier et
relit son en-tête de version à chaque exécution : une copie remplacée fait échouer le test avant
toute capture. Le contrôle n'est PAS fait au chargement de la page — le module n'exporte aucune
version, et la lire exigerait d'aller chercher son texte par le réseau, ce qui est exactement ce
qu'une copie locale sert à éviter.
