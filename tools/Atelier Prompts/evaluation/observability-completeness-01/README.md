# OBSERVABILITY-COMPLETENESS-01 — preuves

| Fichier | Contenu |
| --- | --- |
| `contract.json` | le défaut d'observabilité, le correctif, les champs de l'enregistrement terminal, les empreintes, les fichiers touchés et NON touchés |

**Aucun appel réseau, aucun appel fournisseur, aucun secret.** Toutes les preuves sont
`LOCAL_CONTROLLED` : la suite OBS01 injecte des levées à chaque phase et lit les événements émis.

Le critère de release proposé — « une panne injectée à chaque phase produit un enregistrement
terminal complet, durable et corrélé » — est vérifié par fixture, jamais par une campagne réelle.
