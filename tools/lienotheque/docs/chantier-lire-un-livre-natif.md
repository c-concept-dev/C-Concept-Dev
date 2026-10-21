# Chantier — lire un livre qui n'a pas d'images

Ouvert le 21 octobre 2026, à la demande de Christophe, après le relevé consigné dans
`decisions.md` (« un livre composé en texte n'avait rien à montrer, et ne le disait pas »).

**Ce document existe pour que ce manque soit un chantier et non une dette cachée.** Rien n'est
écrit sur cette base avant arbitrage : c'est un état du problème et des options, pas un plan
approuvé.

---

## 1. Le fait, et son ampleur

Les pages de la vue viennent **uniquement** de la chaîne d'images. `instantaneDeLot` le dit :
« une page existe parce qu'elle a été lue », et ce qui est lu l'est sur l'image de la feuille.
`exporterPages` tire ces images du JPEG que porte chaque feuille d'un document **numérisé**.

Un document composé en texte n'en porte aucun. Aucune image, donc aucun repère, donc **aucune page
dans sa vue**. Il n'y a aucun moteur de rendu dans la chaîne, et ce n'est pas un oubli de
configuration : l'hôte demande toujours les images, il n'y a rien à en extraire.

**Ce que cela touche :** la composition annoncée des bibliothèques est d'environ moitié PDF, moitié
EPUB. Les EPUB n'ont pas de pages du tout — ils ont des feuillets. Les PDF natifs n'ont pas
d'images. **Le Lecteur, aujourd'hui, ne peut montrer que les documents numérisés.**

## 2. Ce qui marche déjà, et qu'il ne faut pas refaire

Le chemin du texte sert ces documents **entièrement** :

| | |
|---|---|
| le texte | lu par la couche, page par page, 100 % sur les natifs mesurés |
| la citation | tombe sur la page où le texte est imprimé, vérifié contre le PDF |
| le numéro imprimé | voté à l'échelle du document, 100 % sur le document mesuré |
| l'emplacement | le chapitre, pour un EPUB (`Passage.emplacement`) |
| la recherche | retrouve et cite correctement |

Depuis le 21 octobre, le Lecteur **dit** qu'il n'a rien à montrer et renvoie à la recherche. C'est
la fin du silence, ce n'est pas la fin du manque : on sait où chercher le texte, on ne peut pas le
lire.

## 3. Ce qu'il manque, dit simplement

**Un écran qui montre le texte d'un document, page par page, sans image de page.** Avec ce qu'on
attend d'une lecture : avancer, revenir, savoir où l'on est, citer ce qu'on lit, et retrouver
depuis la recherche l'endroit exact d'où vient un extrait.

## 4. Trois routes, et ce que chacune coûte

### A. Montrer le texte, sans image

L'écran lit les passages — qui existent déjà, qui portent `page`, `pageImprimee` et
`emplacement` — et les met en page. Aucune image, aucun rendu, aucune dépendance nouvelle.

*Pour :* tout le matériau est là, déposé et éprouvé. Le plus petit chemin vers un Lecteur utile
sur la moitié du corpus.
*Contre :* ce n'est pas le document tel qu'il est imprimé. Une figure, une mise en page, une
partition n'y sont pas.
*Question ouverte :* un EPUB n'a pas de pages mais des feuillets de trois cents mots. Le même
écran sert-il les deux, ou le feuillet demande-t-il sa propre façon d'avancer ?

### B. Rendre les pages en images

Ajouter un moteur de rendu à la chaîne pour fabriquer l'image d'une page native.

*Pour :* le Lecteur actuel fonctionnerait tel quel, et le document serait montré tel qu'il est.
*Contre :* une dépendance de plus à embarquer sur deux systèmes, un coût de traitement sur deux
cent cinquante documents, et un volume de dérivés à mesurer avant de s'y engager. Et cela ne règle
rien pour les EPUB, qui n'ont pas de pages à rendre.

### C. Les deux, dans cet ordre

A d'abord, parce qu'elle est petite et qu'elle débloque la lecture ; B plus tard, si l'on constate
qu'on a besoin de voir la page et pas seulement de la lire.

**Préférence de l'atelier :** C, en commençant par A. B seule laisserait les EPUB dehors, et c'est
la moitié de la moitié.

## 5. Ce que ce chantier ne contient pas

- La traduction, l'écoute, les liens vers des médias : un livre sans enregistrement n'en a pas
  besoin, et les y mêler ferait de ce chantier un second Lecteur.
- La détection de double page sur le chemin des images : c'est un autre manque, nommé à part.
- Le rendu fidèle d'une mise en page (colonnes, figures, notes) : si on le veut, c'est la route B.

## 6. Ce qu'il faudra décider avant d'écrire

1. A, B ou C — et si A, est-ce qu'un feuillet d'EPUB se lit dans le même écran qu'une page de PDF ?
2. Que devient le fil entre la recherche et la lecture : cliquer un résultat doit ouvrir la page
   **à l'endroit de l'extrait**, ce qui demande de savoir surligner dans le texte affiché.
3. Ce qu'on montre d'un document dont le texte est venu de la reconnaissance : la couche, avec ses
   fautes, ou rien ? Ce n'est pas la même promesse qu'un texte éditorial.
