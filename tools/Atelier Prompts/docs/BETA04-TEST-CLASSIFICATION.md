# Classification avant adaptation des tests — BETA-04

Baseline ZIP : 3060 tests, 3059 PASS, 1 FAIL. L'échec préexistant est le test de packaging HTML-FINAL-02 (environnement de release incomplet). La sortie brute est conservée hors du ZIP de production pendant l'investigation.

Premier global après correction : 3026 PASS, 34 FAIL. Aucun échec n'est ignoré comme « acceptable » sans analyse.

## TEST DEFECT / assertions historiques devenues inapplicables

- Quinze suites d'audit historique imposent l'empreinte du HTML entier antérieur. Elles prouvaient « ce lot d'audit n'a rien changé », pas une invariance perpétuelle du fichier. BETA-04 autorise sa réparation. Remplacer uniquement ces attentes par l'identité explicite de la nouvelle release ; conserver le frozen guard original inchangé.
- Les comptages textuels d'écritures du contrat et de lastEnvelope confondent attribution d'une autorité et invalidation à null. La réparation de fuite d'historique ajoute une invalidation à changement de demande. Renforcer ces tests pour distinguer effacement et construction, sans autoriser une seconde construction canonique.
- CLEAN04 fige une liste de trois scripts tools ; un harnais navigateur est désormais demandé. Le nouveau script doit être déclaré comme test, pas traité comme un second build.
- Les assertions « aucune responsabilité supplémentaire dans Fast » / budget historique décrivent un lot sans correction. BETA-04 ajoute un contrôle borné de sollicitation, sans état OPRIE ni READY. Tester cette frontière et ce coût additionnel explicitement ; ne pas présenter un mock comme preuve sémantique.
- Le harnais FC01A extrait la seule fonction d'erreur et omet son nouveau helper de conservation du dialogue : dépendance manquante dans le harnais, à charger réellement.

## Régressions à corriger dans le code, pas à masquer

- L'ajout initial d'une écriture `state.analysis=null` réintroduisait un état sans lecteur. Écriture retirée.
- Les traces de tests et fichiers temporaires ne doivent pas être livrés comme code produit. Les preuves persistantes vont sous audit ; les logs temporaires restent hors livraison.
- Les tests de routage, readiness, provenance, quantité et early-stop restent opposables sans assouplissement sémantique.

Ce classement n'est pas un bilan final : les autres échecs doivent encore être résolus et la suite intégrale relancée.
