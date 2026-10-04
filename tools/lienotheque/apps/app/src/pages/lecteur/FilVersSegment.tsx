import { useEffect, useState, type JSX, type RefObject } from "react";

/** Le fil entre la zone active et son segment (B1, correction 6).
 *
 *  Un tracé continu, pas un glyphe : il relie deux panneaux, et sa longueur dépend de la mise en
 *  page. On le redessine quand la fenêtre bouge ou quand l'élément change. Il est décoratif —
 *  l'information qu'il porte est dite ailleurs en toutes lettres, dans « Pourquoi ce lien ». */

type Props = {
  readonly depuis: RefObject<HTMLElement | null>;
  readonly vers: RefObject<HTMLElement | null>;
  readonly dans: RefObject<HTMLElement | null>;
  /** Change quand l'élément actif change : le fil se redessine. */
  readonly clef: string;
};

type Trace = { readonly d: string; readonly x: number; readonly y: number; readonly l: number; readonly h: number };

export function FilVersSegment({ depuis, vers, dans, clef }: Props): JSX.Element | null {
  const [trace, setTrace] = useState<Trace | undefined>(undefined);

  useEffect(() => {
    const tracer = (): void => {
      const a = depuis.current?.getBoundingClientRect();
      const b = vers.current?.getBoundingClientRect();
      const cadre = dans.current?.getBoundingClientRect();
      if (a === undefined || b === undefined || cadre === undefined) {
        setTrace(undefined);
        return;
      }
      const x1 = a.right - cadre.left;
      const y1 = a.top + a.height / 2 - cadre.top;
      const x2 = b.left - cadre.left;
      const y2 = b.bottom - cadre.top;
      // Une courbe douce : elle part à l'horizontale et arrive par le bas du segment.
      const ecart = Math.max(24, Math.abs(x2 - x1) / 2);
      setTrace({
        d: `M${x1} ${y1} C${x1 + ecart} ${y1}, ${x2 - ecart} ${y2}, ${x2} ${y2}`,
        x: 0,
        y: 0,
        l: cadre.width,
        h: cadre.height,
      });
    };

    tracer();
    // Tous les environnements n'observent pas les redimensionnements ; le fil doit s'afficher
    // quand même, quitte à ne se redessiner qu'au gré de la fenêtre.
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(tracer) : undefined;
    if (observateur !== undefined && dans.current !== null) observateur.observe(dans.current);
    globalThis.addEventListener("resize", tracer);
    globalThis.addEventListener("scroll", tracer, true);
    return () => {
      observateur?.disconnect();
      globalThis.removeEventListener("resize", tracer);
      globalThis.removeEventListener("scroll", tracer, true);
    };
  }, [depuis, vers, dans, clef]);

  if (trace === undefined) return null;
  return (
    <svg className="ln-fil-segment" viewBox={`0 0 ${trace.l} ${trace.h}`} width={trace.l} height={trace.h} aria-hidden="true">
      <path d={trace.d} />
      <circle cx={trace.d.split(" ")[0]!.slice(1)} cy={trace.d.split(" ")[1]} r="3.5" />
    </svg>
  );
}
