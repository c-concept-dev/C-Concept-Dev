# Adaptateurs de cas — HORS NOYAU GÉNÉRIQUE

Le noyau `core/` ne connaît **aucun cas d'application**. Il n'expose que le
concept générique `downstreamUseAuthorized` : *ce résultat peut-il être utilisé
par une étape aval ?*

Un cas d'application qui a besoin d'un nom propre — une phase, un jalon, un
processus métier — le déclare **ici**, jamais dans `core/`.

Une mission qui n'est pas ce cas ne doit jamais rencontrer ce vocabulaire.
