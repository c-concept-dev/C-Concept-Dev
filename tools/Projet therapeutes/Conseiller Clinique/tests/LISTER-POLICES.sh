#!/bin/sh
# LISTE LES POLICES RÉELLEMENT INSTALLÉES SUR CE MAC, au format du tableau ADOC_MAC_FONT_FAMILIES de
# studio-clinique-core.js. À relancer après avoir installé une police, puis recoller la sortie à la
# place du tableau existant.
#
# Pourquoi system_profiler, et pas autre chose — mesuré, pas supposé :
#   · fc-list traite les STYLES comme des familles (Avenir Black, Avenir Book, Avenir Heavy… au lieu
#     du seul Avenir : 640 entrées contre 227) et dépend de Homebrew, absent d'un Mac neuf ;
#   · lire ~/Library/Fonts, /Library/Fonts et /System/Library/Fonts donne des noms de FICHIERS : un
#     .ttc contient plusieurs familles, et les trois SourceCodePro-ExtraLight/Light/Medium.ttf ne
#     forment qu'une seule famille, « Source Code Pro » ;
#   · system_profiler expose le vrai champ `family`, avec enabled/valid pour écarter les polices
#     désactivées ou cassées. Compte ~13 secondes.
#
# Deux filtres qui comptent :
#   · les familles internes de l'interface macOS commencent par un point et ne sont jamais à proposer ;
#   · macOS glisse des caractères de contrôle bidirectionnels INVISIBLES dans certains de ces noms, ce
#     qui déplace le point et le fait passer un test naïf — d'où le retrait des caractères de
#     catégorie Unicode Cf AVANT le test. Sans lui, « ‭.‬Arial Hebrew Desk Interface » entre dans la liste.
system_profiler -json SPFontsDataType | python3 -c '
import json, sys, datetime, unicodedata
def propre(s):
    return "".join(c for c in s if unicodedata.category(c) != "Cf").strip()
fam = set()
for it in json.load(sys.stdin).get("SPFontsDataType", []):
    for tf in it.get("typefaces", []):
        f = propre(tf.get("family") or "")
        if f and not f.startswith(".") and tf.get("enabled") == "yes" and tf.get("valid") == "yes":
            fam.add(f)
noms = sorted(fam, key=str.lower)
print("  // " + str(len(noms)) + " familles, relevees le " + datetime.date.today().isoformat() + ".")
print("  const ADOC_MAC_FONT_FAMILIES = [")
ligne = "   "
for n in noms:
    bout = " \x27" + n.replace("\\", "\\\\").replace("\x27", "\\\x27") + "\x27,"
    if len(ligne) + len(bout) > 108:
        print(ligne); ligne = "   "
    ligne += bout
if ligne.strip(): print(ligne)
print("  ];")
'
