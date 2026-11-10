# Les chiffres d'un message de commit sont écrits par la commande, jamais retapés

**Décidé par Christophe le 10 novembre 2026.** Ses mots :

> « Pour les empreintes et comptes cités dans les messages de commit : fais-les écrire par la
> commande, jamais retaper à la main. »

## Pourquoi, et ce que ça a coûté

Le 10 novembre, le commit qui versait le cahier 25.8 portait dans son message une **empreinte
sha256 et un compte de lignes inventés** — alors que `shasum` et `wc` venaient de les afficher deux
lignes plus haut dans la même session. Le commit n'était pas encore poussé : le message a été
corrigé avec les valeurs mesurées, et il dit lui-même qu'il l'a été.

C'est mot pour mot ce que le § 8 du cahier interdit : **inventer une lecture, un folio ou un
nombre**. Et c'est pire dans un message de commit qu'ailleurs, parce qu'un message est **cité comme
preuve** : il survit, il se relit des mois plus tard, et personne ne va revérifier une empreinte
qu'un commit affirme.

Le même jour, deux heures plus tôt, une mesure non vérifiée avait fait accuser le produit d'un
défaut qui venait du montage de l'essai, et fait rouvrir l'étape 0 dans le cahier de pilotage. Les
deux fautes ont le même geste à leur racine : **écrire la conclusion avant de relire la mesure.**

## La règle

Tout chiffre cité dans un message de commit — empreinte, nombre de lignes, d'octets, de fichiers,
de contrôles, de chemins, une marge — est **produit par la commande qui le mesure**, et le message
est composé à partir de cette sortie :

```sh
{
  echo "…"
  printf '  sha256 %s\n' "$(shasum -a 256 <fichier> | cut -d' ' -f1)"
  printf '  %s lignes, %s octets\n' "$(wc -l < <fichier>)" "$(wc -c < <fichier>)"
} > message.txt
git commit --file=message.txt
```

**Ce que cette forme garantit, et qu'une bonne intention ne garantit pas** : la seule façon d'y
mettre un chiffre faux serait de fausser la mesure elle-même. Un chiffre retapé est un chiffre que
rien ne relie à l'objet qu'il décrit.

## Ce qu'elle ne couvre pas, et qui reste de la vigilance

Un chiffre **lu dans un journal** — le compte des contrôles, une marge, la charge de la machine —
ne peut pas toujours être interpolé par la commande du commit. Pour ceux-là, la règle est plus
faible mais la même dans l'esprit : les relire dans le fichier au moment d'écrire, jamais de
mémoire, et nommer le fichier d'où ils viennent. Ce qui se laisse automatiser l'est ; ce qui ne se
laisse pas automatiser se cite avec sa source.
