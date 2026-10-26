import { useEffect, useMemo, useRef, type JSX } from "react";
import { morceler, surlignagesDe, type CibleRecherche } from "@lienotheque/noyau";

type Props = {
  readonly texte: string;
  readonly cible?: CibleRecherche | undefined;
  /** Position du premier caractère de ce morceau dans le passage entier. */
  readonly origine?: number;
};

/** Texte inchangé, avec les seules portions trouvées par la recherche entourées de `mark`. */
export function TexteSurligne({ texte, cible, origine = 0 }: Props): JSX.Element {
  const visee = useRef<HTMLElement>(null);
  const portions = useMemo(
    () => (cible === undefined ? [] : surlignagesDe(texte, cible.requete)),
    [texte, cible],
  );
  const morceaux = morceler(texte, portions);
  const plusProche = portions.reduce<number | undefined>((choisi, portion, rang) => {
    const distance = Math.abs(origine + portion.debut - (cible?.debut ?? 0));
    if (choisi === undefined) return rang;
    const avant = portions[choisi]!;
    return distance < Math.abs(origine + avant.debut - (cible?.debut ?? 0)) ? rang : choisi;
  }, undefined);
  const debutVise = plusProche === undefined ? undefined : portions[plusProche]?.debut;
  let position = 0;

  useEffect(() => {
    visee.current?.scrollIntoView?.({ block: "center" });
  }, [texte, cible]);

  return (
    <>
      {morceaux.map((morceau, rang) => {
        const debut = position;
        position += morceau.texte.length;
        return morceau.marque ? (
          <mark key={rang} {...(debut === debutVise ? { ref: visee } : {})}>{morceau.texte}</mark>
        ) : (
          <span key={rang}>{morceau.texte}</span>
        );
      })}
    </>
  );
}
