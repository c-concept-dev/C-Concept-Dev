# La lenteur de la voie oracle passe devant le lot 0b

**Décidé par Christophe le 7 novembre 2026**, dans la fenêtre de la session.

L'entrée 14 de la file — la lenteur de `voie-oracle.test.ts` — passe **avant** le lot 0b
(Tesseract sur la CI macOS). Et sa consigne est précise : **ne pas allonger les délais**, mais
comprendre pourquoi chaque contrôle coûte ~80 s et réduire ce coût, mesure avant et après, ici et
sur la CI.

## La raison de Christophe

Le lot 0b fera tourner ces contrôles sur le coureur macOS, **environ trois fois plus lent**. À 82 s
ici, ils dépasseraient 180 000 ms là-bas : le lot 0b rendrait la CI rouge en faisant simplement
tourner ce qui était sauté jusque-là.

## Ce que la cause a révélé, et qui va plus loin

Le coût ne vient ni de l'OCR des pages, ni de leur rendu, mais du **budget d'exploration**, qui est
dimensionné pour la production :

```
ENDROITS_COUVERTS = 128  ×  MOTIFS = 3            →    384 paires
384 × SECONDES_PAR_ESSAI_AU_PLUS_LENT (10,2 s)    →  3 917 s, soit 65 minutes
```

Sur les **27 appels** du fichier de contrôle, **5 seulement** bornent l'exploration ; les 22 autres
héritent de ces 65 minutes. La mesure le confirme au centième : le soir du 7 novembre, une machine
privée de processeur a fait dépenser à un contrôle **3 956 s** — le budget, exactement.

**Et le délai du contrôle ne pouvait pas l'arrêter** : la reconnaissance est lancée par un appel
synchrone, que l'exécuteur de contrôles ne peut pas interrompre. Un contrôle a donc tourné 66
minutes au lieu d'être coupé à 3. **Le vrai garde-fou de durée n'est pas le délai du contrôle, c'est
le budget de la voie.**

Le remède est l'option que le code offre déjà, `budgetExploration`, et dont le commentaire dit
l'intention mot pour mot : « *un essai qui n'a pas quarante minutes à donner* ». Ni nombre inventé,
ni changement du produit.
