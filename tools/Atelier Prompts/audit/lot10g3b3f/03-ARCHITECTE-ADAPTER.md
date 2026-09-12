# Adapter Architecte

`ARCH_SYSTEM`, `ARCH_SCHEMA`, `archContexte()`, l'analyse et la compilation restent inchangés.

Le contrat ADN compact est injecté dans l'enveloppe extérieure `makeEnvelope()` entre l'identifiant d'échange et l'entrée Architecte.

Le bloc précise explicitement que :
- le contrat gouverne le livrable final ;
- Architecte doit, à cette étape, produire uniquement l'analyse JSON prévue ;
- obligations, quantités, hypothèses, verrous et limites doivent être préservés jusqu'à la compilation finale.

Cela évite que la technique 9 « exécuter maintenant » ne soit mal interprétée comme une instruction de contourner la phase d'analyse Architecte.
