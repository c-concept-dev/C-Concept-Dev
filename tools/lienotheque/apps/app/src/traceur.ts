import { estBureau, journaliser } from "./pont/bureau.js";

/** Le traceur : ce que la page fait, porté au journal de l'hôte (JOB-05).
 *
 *  ## Pourquoi il existe
 *
 *  Un paquet n'a pas de console. Un écran qui ne s'affiche pas n'y laisse donc aucune trace, et
 *  il a fallu le deviner — trois fois de suite, et trois fois à côté. Le 21 octobre 2026, un
 *  bouton « ne faisait rien » dans le paquet alors qu'il fonctionnait dans tous les moteurs, dans
 *  toutes les constructions et sur toutes les branches du code éprouvées hors paquet.
 *
 *  Ce qu'on ne peut pas observer, on le suppose — et supposer coûte plus cher que tracer.
 *
 *  ## Ce qu'il dit
 *
 *  | | |
 *  |---|---|
 *  | le démarrage | que la page est bien celle qu'on croit, et quand elle est montée |
 *  | chaque clic | **en phase de capture**, donc avant que quiconque puisse l'arrêter |
 *  | chaque adresse | un changement de `#…`, qu'il vienne d'un clic ou d'ailleurs |
 *  | chaque erreur | y compris les promesses rompues, que rien d'autre ne rattrape |
 *
 *  Le clic est le plus important : s'il apparaît et que l'écran ne change pas, le défaut est
 *  après lui ; s'il n'apparaît pas, l'événement n'arrive jamais jusqu'au code, et c'est tout
 *  autre chose qu'il faut regarder. Aucune supposition ne distingue ces deux cas ; une ligne de
 *  journal, oui.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  Il ne parle qu'à l'hôte : hors du bureau, `journaliser` ne fait rien et le traceur est muet.
 *  Et il ne lève jamais — un traceur qui fait tomber ce qu'il observe détruit la trace qu'il
 *  venait chercher.
 */

/** Ce qu'on retient d'un élément cliqué : de quoi le reconnaître, pas de quoi l'écrire en entier. */
function nommer(cible: EventTarget | null): string {
  if (!(cible instanceof Element)) return "hors élément";
  const agissant = cible.closest("button, a, input, [role='button']") ?? cible;
  const texte = (agissant.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  const desactive = agissant instanceof HTMLButtonElement && agissant.disabled ? " (désactivé)" : "";
  return `${agissant.tagName.toLowerCase()}${desactive} « ${texte} »`;
}

/** Ce qui se trouve réellement sous le doigt, quand ce n'est pas ce qu'on visait.
 *
 *  Un calque transparent posé par-dessus un bouton reçoit le geste à sa place, et le bouton
 *  « ne fait rien » sans qu'aucune erreur ne soit levée. Le navigateur sait répondre à cette
 *  question-là ; encore faut-il la lui poser. Silencieux quand l'élément visé est bien celui du
 *  dessus, pour que la trace ne porte que ce qui surprend. */
function quiEstDessus(geste: PointerEvent): string {
  try {
    const dessus = document.elementFromPoint(geste.clientX, geste.clientY);
    if (dessus === null || dessus === geste.target) return "";
    return ` · MAIS LE DESSUS EST ${nommer(dessus)}`;
  } catch {
    return "";
  }
}

export function brancherLeTraceur(): void {
  try {
    // La première ligne dit **quand**, en clair, et **qui répond**.
    //
    // L'heure lisible n'est pas un confort : le 22 octobre 2026, une trace a été rapportée comme
    // étant celle d'un essai alors qu'elle datait d'un lancement antérieur de cinquante minutes.
    // L'en-tête de l'hôte ne portait que des secondes depuis l'époque, que personne ne lit. Une
    // date en français se compare d'un coup d'œil à sa propre montre.
    //
    // Et si l'hôte n'est pas vu, aucune autre ligne de la page n'arrivera au fichier : une trace
    // qui ne contient que les lignes de l'hôte est déjà une réponse.
    const quand = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
    journaliser(
      `démarrage · ${quand} · hôte ${estBureau() ? "vu" : "ABSENT"} · adresse « ${globalThis.location?.href ?? ""} »`,
    );

    // **Deux témoins, et c'est délibéré.**
    //
    // `pointerdown` dit que le moteur de rendu a bien reçu le geste ; `click` dit qu'il est allé
    // au bout. Les séparer tranche une question qu'une seule ligne laisserait ouverte :
    //
    // | ce qu'on voit | ce que c'est |
    // |---|---|
    // | ni l'un ni l'autre | le geste n'atteint pas la page — fenêtre inerte |
    // | `pointerdown` seul | la page reçoit, mais quelque chose avale le clic : un calque par-dessus, un `pointer-events`, un gestionnaire qui arrête la propagation |
    // | les deux | le geste est complet, et le défaut est après lui |
    //
    // En capture, pour voir le geste **avant** que quiconque puisse l'arrêter.
    globalThis.addEventListener?.(
      "pointerdown",
      (evenement) => {
        const geste = evenement as PointerEvent;
        journaliser(`geste sur ${nommer(geste.target)}${quiEstDessus(geste)}`);
      },
      true,
    );

    globalThis.addEventListener?.(
      "click",
      (evenement) => journaliser(`clic sur ${nommer((evenement as MouseEvent).target)}`),
      true,
    );

    globalThis.addEventListener?.("hashchange", () => journaliser(`adresse → « ${globalThis.location?.hash ?? ""} »`));

    globalThis.addEventListener?.("error", (evenement) => {
      const souci = evenement as ErrorEvent;
      journaliser(`ERREUR ${souci.message} · ${souci.filename ?? "?"}:${souci.lineno ?? 0}`);
    });

    globalThis.addEventListener?.("unhandledrejection", (evenement) => {
      const rompue = (evenement as PromiseRejectionEvent).reason;
      const dit = rompue instanceof Error ? `${rompue.name}: ${rompue.message}` : String(rompue);
      journaliser(`PROMESSE ROMPUE ${dit.slice(0, 200)}`);
    });
  } catch {
    // Un traceur qui tombe emporte la trace qu'il venait chercher.
  }
}
