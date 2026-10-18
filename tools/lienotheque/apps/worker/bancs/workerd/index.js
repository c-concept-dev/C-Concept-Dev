// La moitié serveur de la voie C, mesurée dans le moteur qui la portera : workerd.
//
// Node et workerd n'ont pas la même mise en œuvre de WebCrypto. Vérifier dans Node ne dit rien
// de ce qui se passera en production — d'où ce banc, qui reçoit les octets réellement produits
// par la cérémonie du navigateur (bancs/ceremonie-mesuree.json) et les traite comme le Worker
// le fera.
//
// Sa configuration s'appelle « wrangler.banc.toml » et non « wrangler.toml » : ainsi aucun
// « wrangler deploy » lancé par mégarde dans ce dossier ne trouve de quoi déployer.

const dub64 = (texte) => Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));

/** La signature de WebAuthn est en ASN.1 DER ; WebCrypto veut r‖s brut. */
function derVersBrut(der) {
  if (der[0] !== 0x30) throw new Error("ce n'est pas une séquence DER");
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const lire = () => {
    if (der[i] !== 0x02) throw new Error("entier DER attendu");
    const taille = der[i + 1];
    const debut = i + 2;
    i = debut + taille;
    let valeur = der.slice(debut, i);
    while (valeur.length > 32 && valeur[0] === 0x00) valeur = valeur.slice(1);
    const trenteDeux = new Uint8Array(32);
    trenteDeux.set(valeur, 32 - valeur.length);
    return trenteDeux;
  };
  const r = lire();
  const s = lire();
  const brut = new Uint8Array(64);
  brut.set(r, 0);
  brut.set(s, 32);
  return brut;
}

export default {
  async fetch(requete) {
    if (requete.method !== "POST") return Response.json({ moteur: globalThis.navigator?.userAgent ?? "inconnu" });

    const entree = await requete.json();
    const rapport = { moteur: globalThis.navigator?.userAgent ?? "inconnu" };

    try {
      const cle = await crypto.subtle.importKey(
        "spki",
        dub64(entree.spki),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      rapport.importSpki = "réussi";

      const donneesAuth = dub64(entree.donneesAuthentificateur);
      const donneesClient = dub64(entree.donneesClient);
      const condensat = new Uint8Array(await crypto.subtle.digest("SHA-256", donneesClient));
      const signe = new Uint8Array(donneesAuth.length + 32);
      signe.set(donneesAuth, 0);
      signe.set(condensat, donneesAuth.length);

      const signature = dub64(entree.signature);
      const algo = { name: "ECDSA", hash: "SHA-256" };

      rapport.verifieTelleQuelle = await crypto.subtle.verify(algo, cle, signature, signe);
      rapport.verifieApresConversion = await crypto.subtle.verify(algo, cle, derVersBrut(signature), signe);

      const altere = new Uint8Array(signe);
      altere[0] ^= 0xff;
      rapport.refuseUnMessageAltere = !(await crypto.subtle.verify(algo, cle, derVersBrut(signature), altere));

      // Une signature tronquée ne doit pas passer, et ne doit pas faire tomber le code.
      try {
        rapport.refuseUneSignatureTronquee = !(await crypto.subtle.verify(
          algo,
          cle,
          derVersBrut(signature).slice(0, 63),
          signe,
        ));
      } catch (e) {
        rapport.refuseUneSignatureTronquee = `rejetée par une exception : ${e.message}`;
      }
    } catch (e) {
      rapport.erreur = `${e.name} : ${e.message}`;
    }

    return Response.json(rapport);
  },
};
