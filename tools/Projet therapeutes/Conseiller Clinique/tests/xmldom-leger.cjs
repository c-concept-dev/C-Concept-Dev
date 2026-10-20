// Analyseur XML minimal : il ne REND pas un arbre, il dit si le document est BIEN FORMÉ.
// Écrit à la main pour ne dépendre d'aucune bibliothèque, comme le reste de ce lot.
// Il vérifie : un seul élément racine, balises correctement imbriquées et fermées, attributs
// entre guillemets, entités connues, et aucun « < » nu dans le texte.
function DOMParser(xml) {
  const s = String(xml);
  let i = 0; const pile = [];
  let racines = 0;
  const err = (m) => m + ' (caractère ' + i + ')';
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { if (/[^\s]/.test(s.slice(i))) return err('texte hors de tout élément'); break; }
    const texte = s.slice(i, lt);
    if (!pile.length && /[^\s]/.test(texte)) return err('texte hors de tout élément');
    if (texte.includes('&')) {
      for (const m of texte.matchAll(/&([^;\s]*);?/g)) {
        if (!/^(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+)$/.test(m[1])) return err('entité inconnue : &' + m[1]);
      }
    }
    if (s.startsWith('<?', lt)) { const f = s.indexOf('?>', lt); if (f < 0) return err('prologue non fermé'); i = f + 2; continue; }
    if (s.startsWith('<!--', lt)) { const f = s.indexOf('-->', lt); if (f < 0) return err('commentaire non fermé'); i = f + 3; continue; }
    const gt = s.indexOf('>', lt);
    if (gt < 0) return err('balise non fermée');
    const brut = s.slice(lt + 1, gt);
    if (brut.startsWith('/')) {
      const nom = brut.slice(1).trim();
      if (!pile.length || pile[pile.length - 1] !== nom) return err('fermeture inattendue : </' + nom + '>');
      pile.pop(); i = gt + 1; continue;
    }
    const auto = brut.endsWith('/');
    const corps = auto ? brut.slice(0, -1) : brut;
    const nom = corps.split(/[\s/]/)[0];
    if (!nom) return err('balise sans nom');
    // Attributs : chaque valeur doit être entre guillemets.
    const reste = corps.slice(nom.length);
    const sansAttr = reste.replace(/\s+[\w:.-]+\s*=\s*"[^"]*"/g, '').trim();
    if (sansAttr) return err('attribut mal formé dans <' + nom + '> : ' + sansAttr.slice(0, 30));
    if (!auto) { if (!pile.length) racines++; pile.push(nom); }
    else if (!pile.length) racines++;
    i = gt + 1;
  }
  if (pile.length) return err('élément non fermé : <' + pile[pile.length - 1] + '>');
  if (racines !== 1) return err(racines + ' éléments racine');
  return null;
}
module.exports = { DOMParser };
