# Un document qui porte un réglage que le Studio ne connaît pas encore

Ce socle ne se voit pas à l'écran : il protège un cas précis, et il évite de perdre du travail.

Chaque fois qu'un lot ajoute un réglage au document — la mise en forme d'un titre, le cadrage
d'une image — les documents sauvegardés **après** ce lot portent un champ que les versions
**antérieures** du Studio ne connaissent pas. Avant ce socle, elles **refusaient** de les ouvrir :
« Validation de schéma échouée… must NOT have additional properties ». Autrement dit, revenir en
arrière sur un lot rendait illisibles les documents déjà sauvegardés avec lui — et un autre
ordinateur qui n'avait pas encore rechargé la page faisait de même.

Désormais, un document portant un réglage inconnu **s'ouvre**. Le réglage n'est pas affiché,
puisque cette version du Studio ne sait pas le dessiner, mais il est **conservé** : vous pouvez
travailler, sauvegarder, et le réglage sera toujours là quand vous rouvrirez le document avec une
version qui le comprend. Un message en console (⌥⌘I, onglet « Console ») nomme les champs
concernés — il est destiné au diagnostic, jamais à l'utilisatrice.

Ce qui **ne change pas** : une vraie erreur reste refusée, exactement comme avant — un texte à la
place d'un nombre, un champ obligatoire manquant, un type de bloc inexistant. Et ce que le modèle
produit reste jugé **strictement** : une page générée qui porterait un champ inventé est toujours
refusée avant d'être montrée. La tolérance ne s'applique qu'aux documents **déjà sauvegardés**,
jamais à ce qui sort du modèle.
