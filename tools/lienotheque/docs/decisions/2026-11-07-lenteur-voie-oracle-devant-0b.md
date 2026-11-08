# La lenteur de la voie oracle passe devant le lot 0b

**Décidé par Christophe le 7 novembre 2026**, dans la fenêtre de la session.

L'entrée 14 de la file — la lenteur de `voie-oracle.test.ts` — passe **avant** le lot 0b
(Tesseract sur la CI macOS). Et sa consigne est précise : **ne pas allonger les délais**, mais
comprendre pourquoi chaque contrôle coûte ~80 s et réduire ce coût, mesure avant et après, ici et
sur la CI.

## La raison de Christophe

Le lot 0b fera tourner ces contrôles sur le coureur macOS, plus lent. À 82 s
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

## Correction du 8 novembre 2026 : le facteur « trois fois plus lent » était faux

Ce fichier annonçait un coureur macOS **environ trois fois plus lent**. Le chiffre n'avait jamais
été mesuré — il venait d'une estimation reprise telle quelle, par moi, et écrite ici comme un fait.

Mesuré sur les **34 fichiers de contrôle présents à la fois ici et sur la CI** (course `18bf579f`) :

| | rapport CI / machine locale |
|---|---|
| médiane | **×1,19** |
| le plus défavorable observé | **×1,76** (`rangement.test.tsx`) |
| `derives.test.ts`, 7,8 s ici — le plus comparable en charge processeur | ×1,30 |

**Ce que la mesure ne dit pas, et qu'il faut garder en tête** : les contrôles qui lisent sont
**sautés** sur la CI, faute de Tesseract. Aucun de ces 34 fichiers ne mesure donc le débit d'OCR du
coureur, qui est précisément ce que le lot 0b y fera tourner. Les rapports ci-dessus valent pour du
JavaScript et du rendu, pas pour un sous-processus de reconnaissance.

**Conséquence de tenue** : on retient le facteur **le plus défavorable observé**, ×1,76, et non la
médiane, jusqu'à ce que le lot 0b donne une mesure directe. Un facteur médian appliqué à un travail
qu'il n'a pas mesuré serait un délai calibré par quelqu'un d'autre, sous une autre forme.

La décision elle-même ne change pas : la lenteur passe toujours devant le lot 0b. Sa raison reste
entière — à ×1,76, un contrôle de 102 s ici dépasserait les 180 000 ms là-bas.
