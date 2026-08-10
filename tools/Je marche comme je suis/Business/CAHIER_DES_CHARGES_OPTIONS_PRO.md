# Je marche comme je suis
## Cahier des charges — Options professionnelles pour une commercialisation sans entrave
**Version 2.0 — 7 août 2026 (mise à jour : décisions actées)**

> Ce document part des points bloquants identifiés dans le cahier des
> charges de commercialisation du 7 août et propose, pour chacun,
> plusieurs options de niveau professionnel avec leurs compromis —
> plutôt qu'une solution unique imposée. Il ajoute aussi des sujets
> qui n'étaient pas couverts par le premier document mais qui
> comptent pour qu'un produit payant ne bute sur rien après le
> lancement : support, cadre légal élargi, facturation.
>
> Les prix et conditions exactes des services tiers cités changent
> dans le temps — les repères donnés ici sont qualitatifs
> (complexité, contrôle, dépendance), à vérifier au moment de
> trancher plutôt qu'à prendre comme des chiffres figés.

## Décisions actées depuis la version 1.0

- **§1 (quota)** — Option 1 retenue par défaut : rester sur le palier
  gratuit ORS, protégé par un circuit breaker, sans VPS ni palier
  payant en réserve. Le produit évoluera selon les ventes réelles
  plutôt que d'être dimensionné par avance pour un succès hypothétique
  — posture assumée comme celle de « n'importe quel entrepreneur ».
- **§2 (contrôle d'accès)** — LemonSqueezy retenu, pas Netlify Identity
  ni Stripe direct. Génère les clés de licence nativement, gère la
  TVA internationale (Merchant of Record), Stripe agit en coulisses
  sans intégration séparée à construire. Mode test disponible pour
  valider tout le parcours (achat simulé → clé → vérification Worker
  → accès) avant tout engagement réel de la micro-entreprise.
  Généralisable à de futurs produits vendus sous C Concept&Dev sans
  reconstruire quoi que ce soit côté plateforme de vente.
- **Nom de domaine** — confirmé non obligatoire. Netlify fournit une
  adresse gratuite (`*.netlify.app`) suffisante pour développer,
  tester et même vendre. Un domaine propre (5 à 20 €/an selon
  extension et registrar, vérifié via OVHcloud/Gandi) reste une
  option à trancher seulement au moment de basculer en vente réelle,
  pas un prérequis.

---

## 1. Quota et fiabilité fournisseur

C'était le risque n°1 du premier document — un seul acheteur trop
actif peut priver tous les autres du service. Trois options, non
exclusives entre elles.

### Option A — Passer OpenRouteService sur un palier payant
Élimine directement le risque de quota collectif épuisé. La solution
la plus simple à mettre en œuvre (aucun changement de code), mais
elle rend le produit dépendant d'un coût récurrent proportionnel à
l'usage réel — à chiffrer une fois le volume estimé.

### Option B — Répartir la charge entre plusieurs clés
Plutôt qu'une seule clé ORS partagée par tous, répartir les
utilisateurs entre plusieurs clés (par exemple par lot d'inscription).
Réduit l'impact d'un usage intensif isolé sans changer de palier
tarifaire, mais ajoute de la complexité de gestion et ne résout pas
le problème si la charge globale dépasse la somme des quotas.

### Option C — Circuit breaker et cache des résultats négatifs
Déjà identifié comme piste dans un audit antérieur, jamais construit.
Détecte un début de panne ou de saturation et coupe les appels
inutiles avant d'épuiser tout le quota, plutôt que de laisser chaque
requête tenter sa chance jusqu'au bout. Réduit le risque sans
supprimer sa cause — un usage réellement massif finira par le
retrouver, mais avec un signal clair au lieu d'un blocage silencieux.

**Décision actée** : ni l'Option A (palier payant) ni l'Option B
(VPS de secours) ne sont retenues par défaut — leur coût récurrent
finit toujours par dépasser une recette figée sur un horizon assez
long, calcul fait dans le cahier des charges commercial complet.
Seule l'**Option C** (circuit breaker) est retenue dès maintenant,
sans dépense récurrente : elle protège le palier gratuit contre un
usage anormal isolé sans l'éliminer. Les Options A et B restent
documentées ici comme réserve — à activer seulement si l'usage réel,
mesuré après les premières ventes, le justifie.

---

## 2. Contrôle d'accès professionnel

### Comparatif des options identifiées dans le premier document

| Option | Contrôle | Complexité | Dépendance externe |
|---|---|---|---|
| Netlify Identity | Élevé — géré directement sur la plateforme d'hébergement | Faible | Netlify |
| Stripe Checkout + Worker de vérification | Élevé — logique de vérification entièrement maîtrisée | Moyenne à élevée | Stripe |
| **LemonSqueezy — ✅ retenu** | Moyen à élevé — clé de licence native, tableau de bord de gestion intégré | Faible | LemonSqueezy (qui utilise Stripe en coulisses, sans intégration séparée) |
| Compte avec vérification serveur dédiée | Total | Élevée | Aucune, mais sort du modèle local-first actuel |

**Décision actée** : LemonSqueezy, pour trois raisons qui se
recoupent — génération de clé de licence sans rien construire côté
Worker au-delà d'un simple appel de vérification, gestion automatique
de la TVA internationale (rôle de Merchant of Record, évite une charge
administrative que la micro-entreprise C Concept&Dev n'a pas à porter
seule), et un mode test complet permettant de valider tout le parcours
avant tout engagement réel. Choix généralisable aux futurs produits
vendus sous la même structure, pas seulement à celui-ci.

### Gestion après-vente, quelle que soit l'option retenue
Un système d'accès commercial a besoin, dès le départ, de pouvoir :
- **Révoquer un accès** (remboursement, litige, usage abusif) sans
  devoir redéployer tout le site.
- **Retrouver quel accès correspond à quel achat**, en cas de
  question du client — sans pour autant stocker de donnée de santé
  ou de profil (l'accès et le profil restent deux choses séparées,
  voir §3).

Ces deux besoins orientent plutôt vers les options avec un tableau de
bord de gestion intégré (Netlify Identity, Stripe) que vers un simple
lien privé.

---

## 3. Continuité et portabilité du profil

### Option A — Export/import local
La personne peut télécharger un fichier (ou obtenir un code) résumant
son profil habituel, à réimporter sur un nouvel appareil. Reste
cohérent avec le principe local-first actuel : aucune donnée ne
transite par un serveur, juste un fichier que la personne conserve
elle-même. Coût de développement faible, aucune dépendance nouvelle.

### Option B — Compte léger optionnel, réservé à un palier « Pro »
Un compte simple (email + code à usage unique, sans mot de passe)
permettant de synchroniser le profil entre appareils. Répond mieux au
cas d'une personne changeant souvent d'appareil, mais introduit une
vraie dépendance serveur et une question de confidentialité à trancher
explicitement (quelles données de profil peuvent transiter, sous
quelle forme). À réserver à une offre distincte plutôt qu'imposé à
tous, pour ne pas changer la promesse de confidentialité par défaut.

**Recommandation** : Option A pour tous, Option B seulement si la
demande réelle le justifie après les premiers retours clients.

---

## 4. Cadre légal et protection professionnelle

### Pages légales (rappel du premier document)
Mentions légales, politique de confidentialité, CGU — toujours en
attente des trois informations mentionnées en annexe du premier
document (forme juridique, domaine, hébergeur).

### Assurance responsabilité civile professionnelle
Point non couvert dans le premier document, à considérer sérieusement
compte tenu de la nature du produit : l'application oriente des
personnes ayant déclaré des limitations physiques vers des parcours
en extérieur. Même avec toutes les précautions déjà en place
(P-04/P-11 : incertitudes exposées, aucune garantie de sécurité
affirmée), une assurance professionnelle adaptée à l'activité mérite
d'être étudiée avant une vente à un public élargi — c'est une
question à poser à un professionnel du droit ou de l'assurance, pas
quelque chose qu'un cahier des charges technique peut trancher seul.

### Protection de la marque
Nom « Je marche comme je suis » et logo — vérifier la disponibilité
et envisager un dépôt si la commercialisation se confirme, pour éviter
qu'un tiers ne s'approprie le nom une fois le produit visible
publiquement.

### Politique de remboursement
À définir avant la première vente, pas après la première demande —
en particulier pour un produit numérique où la notion d'« essai »
avant achat n'existe pas forcément.

---

## 5. Support et relation client

### Canal de support
Un point de contact simple (adresse e-mail dédiée suffit à ce stade)
pour les 100 premiers acheteurs — pas besoin d'un système de tickets
complexe à cette échelle, mais il en faut un identifiable.

### FAQ et documentation utilisateur
Une page expliquant en langage clair : pourquoi certaines promenades
sont marquées « à vérifier », pourquoi le profil ne se synchronise pas
entre appareils (tant que l'Option A du §3 seule est en place),
comment contacter le support. Réduit la charge de support en
répondant aux questions attendues avant qu'elles ne soient posées.

### Communication de panne
Si le risque de quota partagé (§1) se matérialise malgré les
mesures prises, avoir un moyen de le communiquer clairement aux
acheteurs (bandeau sur le site, e-mail) plutôt que de laisser
chacun découvrir un message d'erreur générique sans contexte.

---

## 6. Facturation et administratif

- Émission de factures conformes à la forme juridique retenue (encore
  en attente, voir annexe du premier document).
- Statut fiscal et TVA éventuelle à clarifier avec un professionnel
  une fois la forme juridique tranchée — hors périmètre technique de
  ce document.

---

## 7. Mesure d'usage respectueuse de la confidentialité

Pour piloter le produit après lancement (savoir combien de recherches
sont lancées, quel est le taux d'échec réel) sans jamais transmettre
de donnée personnelle : des compteurs agrégés côté Worker (nombre de
requêtes, codes de résultat) suffisent et sont déjà en partie
présents dans la journalisation ajoutée le 6-7 août. Pas besoin d'un
outil d'analytics tiers ni de rien qui identifie une personne — cette
mesure reste cohérente avec le principe local-first déjà en place,
à condition de rester strictement agrégée et de ne jamais logger de
coordonnée précise ou de contenu de profil (déjà respecté aujourd'hui
dans le Worker, à maintenir).

---

## 8. Roadmap combinée, priorisée

1. **Circuit breaker + cache des résultats négatifs** (§1, Option C
   — **retenue**) — le seul chantier §1 à construire maintenant, coût
   de développement faible par rapport au risque couvert. Le palier
   ORS payant et le VPS de secours (§1, Options A/B) restent en
   réserve documentée, non déclenchés tant que l'usage réel ne
   l'exige pas.
2. **Mise en place de LemonSqueezy en mode test** (§2 — **retenu**) —
   construire et valider tout le parcours d'achat sans engager la
   micro-entreprise, avant toute vente réelle.
3. **Export/import de profil** (§3, Option A) — développement léger,
   réduit un vrai risque de service après-vente. Reste ouvert, non
   tranché.
4. **Rédaction des pages légales + vérification assurance/marque**
   (§4) — en parallèle, ne bloque pas le développement technique.
   Toujours en attente des trois informations manquantes (forme
   juridique de C Concept&Dev une fois créée, domaine si acheté,
   hébergeur — Netlify confirmé).
5. **Canal de support + FAQ** (§5) — à préparer avant la première
   vente, pas après la première question.
6. Compte « Pro » avec synchronisation (§3, Option B) et facturation
   formelle (§6) — seulement si la demande réelle après les premiers
   retours le justifie.

---

## Ce que ce document ne tranche pas

Les décisions de forme juridique, de domaine, d'hébergeur et de choix
final entre les options présentées ici restent à vous — ce document
structure les compromis, il ne les tranche pas à votre place.
