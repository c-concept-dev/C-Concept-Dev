# MISSION REAL SMOKE — MONO-08

**Statut : PREPAREE, JAMAIS EXECUTEE.** Le pre-vol etant BLOCKED (voir
reports/mono-08-preflight-v1.json), executer cette mission avec des
reponses synthetiques serait exactement le "faux vert" interdit par le
CDC. Ce document sert de point de depart pour un operateur disposant
d'un acces reseau autorise et d'un identifiant LLM exploitable.

## Domaine choisi et justification

**Conformite WCAG (accessibilite web) des documents publics
gouvernementaux.**

Choisi parce que :
- Public : litterature academique en libre acces, sites web
  d'organismes publics, certifications d'accessibilite publiees.
- Neutre : sujet technique (conformite a une norme W3C), aucune
  question medicale personnelle.
- Non-JMMJS : sans rapport avec le domaine metier final du produit.
- Faible risque : aucune allegation de sante, aucun jugement de
  validite scientifique en jeu.
- Professionnels reellement verifiables : chercheurs academiques
  publiant sous leur nom reel, avec ORCID et DOI publics.
- Documents cibles reellement publics : certifications
  d'accessibilite publiees par des organismes gouvernementaux, urls
  stables.

## Dimensions (2, minimum du CDC)

1. WCAG_METADATA_COMPLIANCE - conformite des metadonnees de documents
   (langue, titre, description) aux exigences WCAG/PDF-UA.
2. WCAG_STRUCTURAL_COMPLIANCE - conformite structurelle (contraste,
   alternatives textuelles, navigation clavier) aux criteres WCAG 2.1 AA.

## Professionnel candidat n°1 — verifie reellement via recherche publique

- Nom : Maarten Marx
- Affiliation : Institute for Logic, Language and Computation,
  University of Amsterdam
- ORCID : 0000-0003-3255-3729 (verifiable publiquement)
- Corpus reel identifie (a confirmer/etendre via une vraie requete
  OpenAlex/Crossref par l'operateur, jamais copie comme s'il s'agissait
  d'une reponse API reelle) :
  - Slager, G., Marx, M. (2025). WCAG Compliance of Open Government
    Documents. TPDL 2025, Communications in Computer and Information
    Science, vol 2694, Springer. DOI : 10.1007/978-3-032-06136-2_17
  - Travaux connexes du meme auteur sur les documents publics
    neerlandais (Woo/Wob) et leur conformite FAIR/accessibilite -
    identifiants exacts a confirmer via une vraie requete OpenAlex/
    Crossref (auteur ORCID 0000-0003-3255-3729), jamais supposes ici.

## Professionnel candidat n°2 — piste identifiee, a confirmer par l'operateur

Un second article reel a ete identifie lors de la preparation ("WCAG
compliance of Swedish public sector websites", DOI
10.1007/s10209-025-01263-x, Universal Access in the Information
Society) - l'identite ORCID precise de son auteur principal n'a pas ete
confirmee lors de cette preparation (aucun acces reseau reel disponible
pour une verification OpenAlex/ORCID complete). L'operateur doit
confirmer cette identite via une vraie requete OpenAlex/ORCID avant de
l'utiliser comme professionnel candidat n°2 - ne jamais supposer une
identite non verifiee.

## Documents cibles (2, minimum du CDC)

1. Governor's Office of Planning and Research (Californie) - Website
   Accessibility Certification -
   https://climateassessment.ca.gov/accessibility-certificate.html
   (page publique reelle, certification de conformite WCAG 2.0 AA avec
   exceptions documentees).
2. Un second document cible reel doit etre identifie par l'operateur
   selon les memes criteres - jamais fabrique ici sans verification reelle.

## Ce qui reste a faire par l'operateur (jamais fait ici, faute de reseau reel)

1. Confirmer le second professionnel (ORCID reel) via une vraie requete
   OpenAlex/ORCID.
2. Identifier le second document cible reel, recuperer son contenu texte
   reel et l'ajouter dans fixtures/mission-real-smoke-v1.json (champs
   content/contentBase64, meme format que target-01 deja rempli).
3. Une fois les deux references confirmees, passer readyForExecution a
   true dans fixtures/mission-real-smoke-v1.json.
4. Lancer bin/run-preflight.js - ne proceder que si overallStatus passe
   a READY.
5. Lancer bin/run-real-smoke.js avec ces references reelles.

## Contenu documentaire deja recupere reellement (target-01)

Le contenu texte de target-01 (page d'accessibilite du Governor's Office
of Planning and Research) a ete reellement recupere via recherche web
lors de la preparation de cette mission - jamais fabrique - et est deja
present dans fixtures/mission-real-smoke-v1.json (champs content/
contentBase64). target-02 reste a completer par l'operateur selon le
meme format.

## Rappel epistemique (section 12 du CDC)

Aucun texte produit par le smoke ne doit jamais affirmer que Maarten Marx
(ou tout autre professionnel reel) "valide", "recommande" ou "pense"
quoi que ce soit au sujet des documents cibles - seul un jumeau
documentaire construit a partir de son corpus publie peut etre compare
aux documents cibles, jamais assimile a une opinion reelle de la personne.
