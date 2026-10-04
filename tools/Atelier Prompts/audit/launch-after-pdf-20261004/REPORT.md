# Blocage au lancement après lecture du PDF

## Verdict

Un défaut de sortie du parcours Architecte est établi par une reproduction réelle sous Safari 26.3. Une analyse reçue en HTTP 200 et conforme au schéma peut encore être refusée par le validateur des citations. L'ancien chemin n'affichait alors qu'un toast temporaire et laissait le bandeau « Préparation approfondie » sans résultat.

Le correctif ajoute une correction fournisseur bornée, avec le contexte original et le validateur inchangé, puis un arrêt visible durablement si l'analyse reste invalide. Les tests automatisés passent et le parcours réel Safari avec PDF synthétique textuel atteint la réponse finale. **La lecture enrichie multimodale suivie du résultat final et le cas initial des citations rejetées restent à valider en réel.** Après examen du résultat, Christophe a explicitement autorisé le commit et le push sur main. Cette autorisation ne transforme pas les limites de preuve en validations acquises.

## Versions réellement distinguées

- Worktree : `claude/safari-multimodal-timeout`, base `5fc944288068a35f60430c5f957c0955c2f1902a`, plus les modifications non commitées décrites ici.
- Répertoire produit : `/Users/christophebonnet/Documents/GitHub/C-Concept-Dev/tools/Atelier Prompts/.claude/worktrees/determined-cartwright-5c7bc9/tools/Atelier Prompts`.
- HTML avant modification : SHA256 `388cc4c803609ad33d39b8c5ab1208a0b4b96b397b3bfef77ee56c10400f94a2`. Le serveur local sur `127.0.0.1:8910/atelier/` dessert ce worktree ; l'empreinte HTTP et celle des scripts chargés ont été comparées.
- HTML publié consulté : SHA256 `2f5f3f54a210be9df3245863c05349ec9f225d96d602f65db3c7c17bf67c25e2`. Il n'est pas identique au worktree. Les portions contrôlées de `routeCurrentMode`, `oprieRunTurn` et `beginApiAnalysis`, dont le chemin fautif, étaient identiques avant notre correction.
- HTML corrigé : SHA256 `c1f6ab79752ad348703617da511b2b1de9577905a249f2bc322d176f677f1664`.

Le dépôt principal, sur une autre branche avec des modifications étrangères à cette mission, n'a pas été modifié. Aucun commit, push ni déploiement n'a été effectué.

## Reproduction et limites du cas réel

Les deux onglets initiaux avaient une demande vide. L'utilisateur a autorisé une demande de test et un autre PDF. La reproduction exploitable a utilisé la pièce déjà présente, `Charte graphique C-Concept-Dev.pdf`, et cette demande :

> Prépare un cahier des charges en français pour une page HTML de présentation de notre institut à partir de la charte jointe. Respecte les couleurs et polices documentées sans inventer de codes. Prévois une version mobile accessible. Je délègue les choix de mise en page non précisés.

Dans l'onglet publié, la lecture enrichie précédente était en erreur, mais le texte local restait disponible. Ce cas démontre le défaut au lancement avec un matériau PDF ; **il ne prouve pas le scénario obligatoire après lecture enrichie réussie**. L'autre onglet, local, affichait bien « Document prêt — enrichi par Anthropic », mais ses appels Worker ont été refusés au préflight CORS. Ce refus de l'origine localhost est distinct du défaut de production ; aucune protection CORS n'a été modifiée.

Instrumentation temporaire : statuts, durées, état d'interface, fin de lecture des corps JSON, nombre d'erreurs du vrai validateur. Aucun en-tête d'autorisation, clé API ni document intégral n'a été consigné.

| Étape réelle | Observation |
| --- | --- |
| Fast | HTTP 200, 834 ms |
| OPRIE | HTTP 200, 27 949 ms, poursuite vers Architecte |
| Analyse Anthropic | HTTP 200, 80 583 ms, corps lu en 2 ms, `tool_use` |
| Correction de schéma Anthropic | HTTP 200, 75 433 ms, corps lu en 1 ms, `tool_use` |
| Validation de schéma finale | Aucune violation |
| Validation Architecte | Quatre citations introuvables dans `materiau` |
| Compilation et exécution | Non atteintes ; prompt final vide |
| Interface après échec | Panneaux masqués ; toast temporaire ; bandeau de préparation conservé |

La seconde requête Anthropic correspond au chemin de correction du transport ; les violations de sa première réponse n'ont pas été conservées. Les quatre erreurs finales, elles, ont été observées directement. Deux citaient des fragments assemblés par `...`, par exemple `Teal action · #3d8d94 ... Footer · #5d5d5d — jamais noir`. Le validateur ne doit pas accepter cet assemblage comme citation contiguë.

Ces observations excluent un corps HTTP restant en attente dans cette reproduction. Elles ne démontrent pas que tous les blocages signalés ont cette unique cause.

## Chemin de code et correction

Les références suivantes désignent l'HTML corrigé dans ce worktree.

Le bouton principal entre par `routeCurrentMode`, puis le routeur V11, `oprieRunTurn`, la décision OPRIE et l'entrée Architecte. `beginExchange` appelle ensuite `beginApiAnalysis`. Le matériau est préparé par les fonctions de documents existantes ; ni le routage ni la décision de readiness ne sont modifiés.

- `transportAnthropic`, ligne 6023 : la conformité du schéma ne garantit pas la présence des citations dans le matériau.
- `archCitationPresente`, ligne 9584, et `archValider`, ligne 9587 : contrôle réel des fondements. Ces fonctions restent inchangées.
- `beginApiAnalysis`, lignes 11375 à 11408 : capture unique du contexte initial ; une seule correction logique supplémentaire, au moyen du `promptCorrection` déjà exposé par le moteur ; revalidation obligatoire avant import. Aucune citation n'est inventée, remplacée ou supprimée localement.
- `beginExchange`, ligne 11882 : réutilisation de `adnShowPostOprieStop` en cas d'échec au lieu de masquer les panneaux sans état terminal durable.
- `adnShowPostOprieStop`, ligne 25467 : affiche le message existant « Préparation indisponible », conserve la demande et permet de réessayer. Il ne change pas le verdict OPRIE.

Fournisseur, modèle, schéma, effort et délai restent les mêmes. Le budget de lecture PDF et les délais du transport texte ne sont pas augmentés. Attention au coût : la correction sémantique peut ajouter un appel logique, lequel peut lui-même utiliser la correction de schéma déjà présente dans le transport. Ce n'est pas une optimisation de latence, et son efficacité réelle doit encore être mesurée.

## Vérification automatisée

Commande : `node --test --test-reporter=spec tests/*.test.mjs`.

Résultat : **3 813 tests recensés, 3 812 réussis, zéro échec, un ignoré**. Journal local : `/tmp/atelier-launch-tests-final-20261004.log`.

`tests/continuite-api-citation-cont04b.test.mjs` exécute la page entière en VM et le vrai validateur, mais les réponses réseau et le DOM sont simulés :

- T1 conserve le parcours nominal sans PDF, jusqu'au prompt final et à son exécution simulée.
- T2 conserve les contrôles de fidélité des citations.
- T3 refuse encore une citation absente après la correction bornée et vérifie le message durable ainsi que l'absence d'exécution.
- LAUNCH-01 restaure un document par la mécanique de session du produit, rejoue le motif « fragments séparés par ... », vérifie la présence du contexte initial complet dans la correction, puis la compilation et l'exécution d'une réponse corrigée simulée.
- LAUNCH-02 vérifie un refus fournisseur 401, la demande conservée, l'arrêt visible et un nouveau lancement sans verrou abandonné.

Les deux compteurs de sous-suites passent de 30 à 32 pour ces deux tests supplémentaires. Quinze assertions historiques d'empreinte globale de l'HTML ont été actualisées à l'artefact corrigé ; leurs autres contrôles n'ont pas été modifiés. Ces empreintes ne constituent pas une preuve fonctionnelle.

`node tools/frozen-guard.mjs` : **OK, sept plages inchangées**. `git diff --check` : aucun défaut. Le runtime ADN et les Workers ne sont pas modifiés.

## Vérification réelle restante

L'inspecteur Safari est d'abord devenu non pilotable, puis noir. Un nouvel onglet a permis de reprendre le test sans déployer ni élargir CORS.

Deux substitutions locales Safari ont été chargées et vérifiées dans l'onglet `ATELIER TEST LOCAL - NON PUBLIE` : HTML corrigé `c1f6ab79752ad348703617da511b2b1de9577905a249f2bc322d176f677f1664` et `core/documents/reading.js` `8cc8c61f9a970b0c285bb16fad4b06ab12629df98f273a5129c1b95ab6a35543`. Le marqueur de la boucle corrective est présent dans les scripts chargés. Ces substitutions doivent être supprimées ou désactivées avant de considérer un prochain essai comme un test du site publié. Aucun fichier publié n'est modifié par ces substitutions. Les wrappers de diagnostic sont temporaires et ne lisent pas la clé ; l'utilisateur a connecté Anthropic et l'onglet n'a plus été rechargé depuis.

Un PDF synthétique sélectionnable de trois pages, `atelier-projet-fictif-test.pdf`, a été créé et vérifié visuellement. Il décrit une matinée jardinage fictive avec horaires, budget et contraintes. Sa lecture locale est terminée dans Safari. Demande utilisée :

> On organise la matinée jardinage décrite dans le PDF. Fais une fiche pratique en français pour nos deux bénévoles : planning de 9 h à 12 h, matériel, budget estimatif et solution s’il pleut. Respecte les contraintes du document. Je te laisse choisir les détails qui ne sont pas précisés.

Un seul clic de lancement a été effectué. Trace corrélée : Fast HTTP 200 en 531 ms ; OPRIE HTTP 200 en 25 786 ms, `operational_request_ready` ; analyse Anthropic HTTP 200 en 63 317 ms, `tool_use` ; deuxième réponse structurée puis vraie validation Architecte `[]` ; exécution finale HTTP 200 en 43 451 ms, `end_turn`. Le prompt compilé contient 12 739 caractères et l'interface affiche « Réponse reçue et prise en compte (Réponse IA — cycle 1.txt) » avec la fiche opérationnelle jardinage. Le parcours réel API a donc abouti sur ce PDF synthétique. Le relevé AX de Safari s'est figé pendant le traitement : des captures visuelles ont établi le résultat final ; la durée du deuxième appel n'a pas été récupérée. Ne pas déduire un temps total des observations intermédiaires devenues périmées.

La validation Architecte de ce cas réussit sans déclencher la nouvelle correction sémantique : ce succès ne prouve pas encore son efficacité sur le cas initial des citations rejetées. Ce PDF de texte teste la lecture locale, pas une lecture enrichie multimodale. Les cinq tests ciblés de continuité ont été relancés : 5/5. Les deux substitutions Safari ont ensuite été désactivées (cases vérifiées à 0), sans recharger l'onglet qui conserve le résultat. Les wrappers temporaires de cet onglet disparaîtront au rechargement.

Reste à réaliser avec une session de navigateur utilisable : charger le PDF IRC choisi, obtenir la lecture enrichie réussie, lancer la demande avec le correctif local, vérifier le prompt compilé puis la réponse finale, et refaire un lancement réel sans PDF. Une éventuelle clé devra être saisie par l'utilisateur dans l'interface de connexion, jamais dans la conversation.

L'inspection a aussi relevé une différence à examiner lors de ce test : `oprieBuildBody` (ligne 25651) utilise `d.text`, tandis que le matériau Architecte peut inclure `lectureCanonique`. Aucun lien causal avec l'échec reproduit n'est établi ici ; ce chemin n'a pas été modifié dans ce lot.

## État de livraison

Correctif local non commité, sur la base PDF `5fc94428`. Les fichiers de production modifiés se limitent à l'HTML. Les autres modifications concernent les tests, les empreintes historiques et le manifeste documentaire. Le script `evaluation/launch-diagnostic-local.js` est un instrument opt-in, jamais chargé par le produit.

La rédaction suit le guide Pages pour séparer preuve réelle, simulation et points non vérifiés. Le parcours synthétique textuel est réussi de bout en bout ; les limites décrites ci-dessus subsistent. Publication sur main autorisée explicitement par Christophe après ce test. Les mentions « non commité » et « aucun push » précédentes décrivent l'état lors de l'investigation, avant cette autorisation.
