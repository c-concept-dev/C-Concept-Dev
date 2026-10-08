# Captures des écrans

Les images de ce dossier sont **prises dans l'application de bureau elle-même**, et non dans un
navigateur de test. Un navigateur suffit pour éprouver un comportement ; il ne suffit pas pour
montrer un écran : la fenêtre, ses polices, son rendu de texte et ses coins viennent du système,
et c'est cela qu'on veut sur l'image.

```bash
cd apps/app && python3 src-tauri/outils/capturer-ecrans.py
```

L'application s'ouvre pour de vrai, à 1320 × 900 points, se place tour à tour sur chaque écran et
chaque thème, dit où elle est, et attend d'avoir été photographiée avant de passer au suivant. La
prise d'image appartient au script et non à l'application : macOS accorde l'autorisation
« Enregistrement de l'écran » au programme qu'on lance soi-même — ici le terminal — plutôt qu'à une
application qui la réclamerait au passage. **La première exécution ouvre donc une demande
d'autorisation : il faut l'accepter, puis relancer.** Une image que le système a refusé de prendre
pèse presque rien, et le script le dit plutôt que de livrer un dossier d'images vides.

Les écrans tirent leurs données du jeu de démonstration (`?demonstration`), qui n'existe qu'en
développement : **aucune œuvre, aucune donnée réelle** sur ces images.

## Ce qu'on y voit

| Image | Écran | Thème |
|---|---|---|
| `1-creer-clair.png` | Créer une bibliothèque, premier temps | clair |
| `1-creer-hybride.png` | Créer une bibliothèque, premier temps | hybride photographique |
| `2-organisation-clair.png` | Organisation | clair |
| `2-organisation-hybride.png` | Organisation | hybride photographique |
| `3-depot-et-traitement-clair.png` | Dépôt et traitement | clair |
| `3-depot-et-traitement-hybride.png` | Dépôt et traitement | hybride photographique |

Le thème hybride n'est pas une variante décorative : c'est lui qui montre les défauts de charte.
Les deux écrans de l'étape 2 y ont été corrigés après une première série de captures, où le titre,
le fil d'Ariane et le pied tombaient directement sur la photographie et devenaient illisibles.
Tout bloc de texte porte désormais son panneau graphite.

L'écran de traitement a été corrigé de la même façon : sa première capture montrait une colonne
d'actions trop étroite, un bouton « Pause » coupé par le bord et un lien « Ouvrir » qui chevauchait
« Reprendre ». Un bouton à moitié coupé n'est pas un bouton, et aucun test ne le dit.

La fenêtre fait 1320 × 900 points : les écrans y défilent, là où les maquettes de
`docs/maquettes/` tiennent d'un seul tenant en 1600 × 1000. Les maquettes sont illustratives ;
ces images-ci disent ce que l'application rend.
