# Renouveler le jeton d'accès au Worker

> **Porte de Christophe.** Tout changement de secret lui est soumis avant (CLAUDE.md, règle 6 et
> gestes autorisés). Ce document décrit les gestes ; il ne les exécute pas, et personne d'autre
> ne les exécute sans son mot.

## Ce que ce jeton est, et ce qu'il n'est pas

| | |
|---|---|
| **Ce que c'est** | un laissez-passer vers **notre** Worker `lienotheque-api`, et rien d'autre |
| **Ce que ce n'est pas** | la clé du modèle. `ANTHROPIC_API_KEY` vit sur le Worker, n'en sort jamais, et **n'est pas concernée par ce renouvellement** |
| **Où il est attendu** | secret `JETON_ACCES` du Worker, comparé en temps constant par `memeJeton` (`apps/worker/src/app.ts`) |
| **Où il est gardé** | trousseau du système, service `lienotheque-jeton`, lu par `jetonDacces()` |
| **Ce qu'il ouvre si on le perd** | les routes du Worker, donc des appels au modèle **à nos frais**. Pas de données de bibliothèque : le Worker ne porte aucune œuvre |

## Le point à comprendre avant de commencer

`laisserEntrer` compare le jeton présenté à **une seule** valeur attendue. Il n'existe donc
**aucune fenêtre à deux jetons** : à la seconde où le secret du Worker change, l'ancien jeton est
refusé (401), et tant que le trousseau n'est pas à jour, la machine ne passe plus.

**Conséquence : une courte interruption est inévitable**, et elle est voulue — c'est ce qui
garantit que l'ancien jeton meurt vraiment. Faire autrement demanderait d'accepter deux jetons
pendant la bascule, c'est-à-dire de garder l'ancien vivant, ce qui est exactement ce qu'un
renouvellement doit empêcher.

Il faut donc **ne rien lancer d'autre pendant la bascule** : aucune mesure Vision, aucun
traitement en cours dans l'application.

## La procédure

### 1. Fabriquer le nouveau jeton

Sur la machine, sans qu'il passe par un fichier ni par l'historique du terminal :

```bash
openssl rand -hex 32
```

64 caractères, comme l'actuel. **Ne pas** le coller dans un éditeur, un message, un ticket.

### 2. Le poser sur le Worker

Depuis `apps/worker`, **toujours avec `--config`** — sans lui, wrangler remonte à la racine du
dépôt et vise le site statique :

```bash
cd apps/worker && npx wrangler secret put JETON_ACCES --config wrangler.toml
```

La commande demande la valeur sur l'entrée standard : la coller là, pas en argument (un argument
entre dans l'historique du shell).

Poser un secret ne redéploie pas le code ; il prend effet sur les requêtes suivantes.

### 3. Le poser au trousseau

Remplacer l'entrée existante — `-U` met à jour au lieu de refuser :

```bash
security add-generic-password -U -s lienotheque-jeton -a "$USER" -w
```

Sans `-w <valeur>` : la commande demande la valeur, qui n'entre donc pas dans l'historique.

### 4. Vérifier, sans rien dépenser

```bash
cd tools/lienotheque && npx tsx outils/vision/mesures/verifier-route.ts
```

Ce programme lit le jeton par `jetonDacces()` et touche la route. Un **401** signifie que les
deux côtés ne concordent pas ; reprendre l'étape qui manque.

### 5. Consigner

Au registre : la date, **pourquoi** le renouvellement a eu lieu, et le fait que l'ancien jeton
est mort. **Jamais la valeur**, ni ancienne ni nouvelle.

## Ce qu'il ne faut pas faire

- **Ne pas** écrire le jeton dans `.env`, un fichier de configuration, une archive, un dossier
  copiable, ni le dépôt — le dépôt est public (CLAUDE.md, règle 6).
- **Ne pas** le poser dans la variable `LIENOTHEQUE_JETON` : depuis le 6 novembre 2026,
  `jetonDacces()` ne la lit plus, et sa seule fonction est de **faire refuser de démarrer** les
  douze programmes de mesure hors ligne. L'y mettre les empêcherait de tourner sans rien ouvrir.
- **Ne pas** lancer `wrangler` depuis la racine du dépôt, ni toucher à `Worker/` : ce dossier
  appartient à `clone-proxy`, dont Studio Clinique dépend.
