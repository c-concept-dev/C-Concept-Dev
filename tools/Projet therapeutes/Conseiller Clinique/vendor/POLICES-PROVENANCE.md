# Les deux polices du Studio — copies locales épinglées

| | |
|---|---|
| Familles | **IBM Plex Sans** (sans) et **Source Serif 4** (serif) |
| Licence | **SIL Open Font License 1.1** pour les deux |
| Dossier | `vendor/polices/` |

| Fichier | Taille | SHA-256 (16 premiers) |\n|---|---|---|\n| `IBMPlexSans-LICENSE.txt` | 4456 octets | `7e6b2818edbd8f6a` |\n| `IBMPlexSans-variable-latin-ext.woff2` | 25868 octets | `ae1d854fefa1167a` |\n| `IBMPlexSans-variable-latin.woff2` | 40240 octets | `056e4e2459f57a00` |\n| `SourceSerif4-LICENSE.txt` | 4400 octets | `5f94c3fd3a23131a` |\n| `SourceSerif4-latin-ext.woff2` | 239888 octets | `9f3e16d59834f495` |

**Pourquoi des copies locales.** Le convertisseur autonome est un fichier unique ouvert par
double-clic : il n'a ni serveur ni réseau. Mesuré le 18 octobre, sans réseau **aucune des 30
polices du Studio ne charge** et le texte des images sort dans les polices du système : les
hauteurs ne changent pas, donc rien n'est coupé, mais **aucune des 19 images n'est identique** à
celles du banc servi (+3,8 % de poids). Embarquer les polices est la seule façon de rendre au
convertisseur la typographie dont le lot 2 a mesuré la fidélité (V7).

**D'où elles viennent.** IBM Plex Sans : les sous-ensembles `latin` et `latin-ext` servis par
Google Fonts pour `family=IBM+Plex+Sans:wght@400;500;600;700`, pris une seule fois le 18 octobre.
**Mesuré en les prenant** : les quatre graisses demandées renvoient **le même fichier** (deux
empreintes distinctes pour huit téléchargements) — c'est une police **variable**, et elle est donc
déclarée avec une plage de graisses, non avec quatre déclarations qui pointeraient le même octet.
Source Serif 4 : le fichier déjà présent dans le dépôt (`tools/lienotheque/docs/ui-kit/assets/fonts/`),
recopié ici pour que la forge du convertisseur n'aille rien chercher hors de son propre dossier.

**Licences.** `SourceSerif4-LICENSE.txt` et `IBMPlexSans-LICENSE.txt` accompagnent les fichiers,
comme l'OFL l'exige. Aucune des deux ne restreint l'incorporation dans un document.
