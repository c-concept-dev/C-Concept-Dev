import { journaliser } from "./pont/bureau.js";

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

export function brancherLeTraceur(): void {
  try {
    journaliser(`démarrage · adresse « ${globalThis.location?.hash ?? ""} »`);

    // En capture : on veut savoir que le clic est arrivé, même si quelque chose l'arrête ensuite.
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
