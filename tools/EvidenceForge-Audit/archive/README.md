# Archive de l’interface historique

`index-v1.0.4.html.txt` conserve octet pour octet l’ancien `tools/EvidenceForge-Audit/index.html`, provenant de la copie partielle MONOLITH-v1.0.4.

SHA-256 : `df93be02835ebad29d9f9e9ab7f26298c7ed78ec1f5b951eaf4fcaaaaf53f0bd`

L’extension `.txt` évite son exécution comme application et son inclusion dans le catalogue HTML. La version antérieure reste également accessible dans Git.

L’ancien serveur et ses tests supposent une interface applicative dans `index.html` : ils constituent désormais un historique, pas le point de lancement actif. Le serveur canonique utilise son propre index dans `tools/EvidenceForge/`, sélectionné par `ACTIVE_VERSION`.

Le nouvel index public est un portail statique : son lien ouvre `http://localhost:8768` dans la même fenêtre, sans script, sonde réseau, iframe ou redirection automatique. La version active est annoncée uniquement par le serveur local.
