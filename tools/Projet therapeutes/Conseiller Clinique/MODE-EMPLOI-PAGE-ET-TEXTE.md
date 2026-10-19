# Ajouter une page, et récupérer le texte des diapositives

Deux gestes, dans l'éditeur d'une présentation. Ils ne concernent que les présentations
créées par le Studio : sur un carrousel ou un document ancien, ils ne s'affichent pas.

---

## Pour Christine — ajouter une page

1. **Cliquez un paragraphe** de la diapositive près de laquelle vous voulez la nouvelle page.
   Le panneau « Corriger ce passage » s'ouvre.
2. Choisissez **« Insérer une page avant »**, **« Insérer une page après »**, ou
   **« Ajouter une page à la fin »**.
3. **Écrivez en une phrase** de quoi la page doit parler. Vous pouvez aussi **laisser vide** :
   le Studio propose alors un sujet d'après les diapositives voisines.
4. **« Créer la page »**, puis lisez l'aperçu.
5. **« Insérer »** si elle convient · **« Refaire »** pour une autre proposition ·
   **« Abandonner »** pour en rester là.

**Rien n'entre dans votre document avant que vous cliquiez « Insérer ».**

### Si le Studio dit que la page est incomplète

Le message est : *« La page est incomplète : un bloc n'a pas de contenu. Rien n'a été
inséré. »* Cliquez **« Refaire »**. Votre document n'a pas bougé.

### Vous venez d'insérer et vous changez d'avis

Juste sous la nouvelle page, **« Annuler cette page »** la retire et remet le document
exactement comme il était. **Ce retour en arrière ne vaut qu'un pas** : dès que vous
modifiez autre chose, il disparaît — revenir en arrière emporterait ce nouveau travail.

### Une seule précaution, importante

**N'écrivez aucune donnée de patient dans la phrase.** Elle part chez Anthropic. Décrivez un
**sujet**, jamais une personne : ni nom, ni initiales, ni âge, ni ville, ni détail de
situation qui permettrait de reconnaître quelqu'un.

---

## Pour Christine — le texte des diapositives, pour la narration

Le bouton **« Texte des diapositives »**, en haut, copie et télécharge un fichier texte :
le titre de chaque diapositive avec son numéro, la marque de chaque étape, les listes avec
leurs puces, les tableaux ligne par ligne. Les renvois de sources n'y sont pas — c'est un
texte à lire, pas une bibliographie.

Il est **calculé sur place** : aucun appel, aucune attente, et deux clics donnent toujours
le même fichier.

---

## Pour Christophe — ce qui se passe dessous

- **Un seul appel au modèle** par page (« Créer la page » ou « Refaire »). « Insérer »
  n'appelle rien.
- **La page est validée contre le schéma réel des documents** — le même validateur que
  l'application — **avant l'aperçu et de nouveau avant l'insertion**. Une page qui ne passe
  pas n'est ni affichée ni insérable.
- **Le détail technique d'un refus est en console**, jamais à l'écran. La réponse brute du
  modèle reste en mémoire dans `window._adocDernierBrutPageNeuve` (jamais sur le disque)
  pour le diagnostic.
- **Rien n'est écrit dans la base.** Insérer une page ne déclenche aucune sauvegarde : seuls
  « Enregistrer » et « Enregistrer sous » écrivent, et seulement sur clic.
- **Les diapositives voisines ne bougent pas** : identifiants, blocs, narration, étapes et
  images rendues sont inchangés, au bit près.
- Une diapositive **n'admet pas de tableau** (le schéma l'interdit) : le Studio ne propose
  donc que titre, paragraphe, liste, encadré et citation.
