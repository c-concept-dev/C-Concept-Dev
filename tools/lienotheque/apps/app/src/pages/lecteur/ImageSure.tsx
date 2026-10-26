import { useEffect, useRef, useState, type JSX } from "react";
import { imageAffichable } from "../../image-affichable.js";

type Props = {
  readonly source?: string | undefined;
  readonly charger?: ((source: string) => Promise<string | undefined>) | undefined;
  readonly alt: string;
  readonly className: string;
};

/** Une image qui n'est révélée qu'une fois décodée.
 *
 * Les adresses en ligne expirent. Les demander au voisinage de la fenêtre, puis réessayer une
 * fois après un échec, évite à la fois de périmer toute une bande hors écran et d'exposer
 * l'icône d'image cassée du navigateur. */
export function ImageSure({ source, charger, alt, className }: Props): JSX.Element {
  const repli = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(charger === undefined);
  const [adresse, setAdresse] = useState<string | undefined>(() =>
    charger === undefined ? imageAffichable(source) : undefined,
  );
  const [chargee, setChargee] = useState(false);
  const [echec, setEchec] = useState(false);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    setChargee(false);
    setEchec(false);
    setEssai(0);
    if (charger === undefined) {
      setVisible(true);
      setAdresse(imageAffichable(source));
    } else {
      setVisible(typeof IntersectionObserver === "undefined");
      setAdresse(undefined);
    }
  }, [source, charger]);

  useEffect(() => {
    if (charger === undefined || visible || repli.current === null) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observateur = new IntersectionObserver((entrees) => {
      if (entrees.some((entree) => entree.isIntersecting)) setVisible(true);
    }, { rootMargin: "240px" });
    observateur.observe(repli.current);
    return () => observateur.disconnect();
  }, [charger, visible]);

  useEffect(() => {
    if (!visible || charger === undefined || source === undefined || echec) return undefined;
    let vivant = true;
    void charger(source).then((resultat) => {
      if (!vivant) return;
      setAdresse(imageAffichable(resultat));
      if (resultat === undefined) setEchec(true);
    }).catch(() => {
      if (vivant) setEchec(true);
    });
    return () => { vivant = false; };
  }, [visible, charger, source, essai, echec]);

  if (adresse === undefined || echec)
    return <span ref={repli} className={className} data-image-repli aria-hidden="true" />;

  return (
    <img
      className={className}
      src={adresse}
      alt={alt}
      decoding="async"
      loading="lazy"
      style={{ visibility: chargee ? "visible" : "hidden" }}
      onLoad={() => setChargee(true)}
      onError={() => {
        setChargee(false);
        setAdresse(undefined);
        if (charger !== undefined && essai === 0) setEssai(1);
        else setEchec(true);
      }}
    />
  );
}
