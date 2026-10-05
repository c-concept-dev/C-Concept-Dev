import { useCallback, useEffect, useRef, useState } from "react";

/** Le lecteur audio, un seul pour toute l'application (ANC-03, ANC-05, UX-02).
 *
 *  Le Lecteur et Vérifier écoutent la même chose de la même façon : on se place au début du
 *  segment quand il est connu, au début de la piste quand il ne l'est pas, et on s'arrête à sa
 *  fin. Deux écrans qui liraient chacun à leur manière finiraient par ne pas dire la même chose
 *  du même lien.
 *
 *  Le tempo passe par « playbackRate », avec « preservesPitch » : les trois moteurs savent
 *  aujourd'hui ralentir sans transposer, et c'est leur étirement temporel qui le fait, pas le
 *  nôtre. Le réglage vaut 50 à 100 % (CDC, écran du Lecteur) ; au-delà de ces bornes, rien
 *  d'utile pour reprendre un passage.
 *
 *  Le drapeau porte trois noms selon l'âge du moteur. On les pose tous les trois : celui qui
 *  n'existe pas est ignoré, et celui qui existe empêche la hauteur de monter quand la vitesse
 *  baisse. Sans lui, ralentir de moitié transpose d'une octave — et ce qu'on voulait ralentir
 *  pour le travailler n'est plus ce qu'on écoute. */

/** Bornes du réglage de tempo, reprises du CDC : 50 à 100 %. */
export const TEMPO_MIN = 50;
export const TEMPO_MAX = 100;

/** Pose la vitesse et demande au moteur de garder la hauteur.
 *
 *  `preservesPitch` est le nom normalisé ; les deux autres sont les noms que des moteurs plus
 *  anciens comprennent encore. Écrire sur une propriété que le moteur ignore ne coûte rien, et
 *  l'oublier ferait transposer le ralenti là où elle aurait suffi. */
export function appliquerTempo(element: HTMLAudioElement, tempo: number): void {
  const vitesse = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo)) / 100;
  const avecNomsAnciens = element as HTMLAudioElement & { mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean };
  element.preservesPitch = true;
  avecNomsAnciens.mozPreservesPitch = true;
  avecNomsAnciens.webkitPreservesPitch = true;
  element.playbackRate = vitesse;
}

export type Ecoute = {
  /** Une source existe. Faux : « média non disponible ici ». */
  readonly disponible: boolean;
  /** La source a été refusée ou n'a pas pu être lue. */
  readonly enPanne: boolean;
  readonly enLecture: boolean;
  /** Position dans la piste, en secondes. */
  readonly positionS: number;
  /** Durée de la piste quand le navigateur la connaît, celle annoncée sinon. */
  readonly dureeS: number;
  readonly basculer: () => void;
  readonly arreter: () => void;
};

export type Reglages = {
  readonly source?: string | undefined;
  /** Début du segment, en secondes. Zéro quand le segment est inconnu : on ne pose pas un
   *  curseur là où l'on ne sait pas (ANC-03). */
  readonly debutS?: number | undefined;
  /** Fin du segment. Absente, on lit jusqu'au bout de la piste. */
  readonly finS?: number | undefined;
  readonly boucle?: boolean;
  /** Durée annoncée par le dépôt, le temps que le navigateur lise la sienne. */
  readonly dureeAnnonceeS?: number | undefined;
  /** Tempo en pourcentage de la vitesse d'origine. 100 par défaut. */
  readonly tempo?: number;
};

export function useEcoute({ source, debutS = 0, finS, boucle = false, dureeAnnonceeS, tempo = 100 }: Reglages): Ecoute {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [enLecture, setEnLecture] = useState(false);
  const [positionS, setPositionS] = useState(debutS);
  const [dureeLue, setDureeLue] = useState<number | undefined>(undefined);
  const [enPanne, setEnPanne] = useState(false);

  // Les bornes vivent dans une référence : l'écouteur de position est posé une fois, et doit
  // voir les bornes du segment courant, pas celles d'il y a trois rendus.
  const bornes = useRef({ debutS, finS, boucle, tempo });
  bornes.current = { debutS, finS, boucle, tempo };

  /** Change de source ou de segment : on repart de son début, et rien ne continue de jouer. */
  useEffect(() => {
    setEnLecture(false);
    setEnPanne(false);
    setDureeLue(undefined);
    setPositionS(debutS);

    if (source === undefined || typeof Audio === "undefined") {
      audio.current = null;
      return undefined;
    }

    const element = new Audio(source);
    element.preload = "metadata";
    appliquerTempo(element, bornes.current.tempo);
    audio.current = element;

    const surTemps = (): void => {
      const { debutS: debut, finS: fin, boucle: enBoucle } = bornes.current;
      setPositionS(element.currentTime);
      if (fin === undefined || element.currentTime < fin) return;
      if (enBoucle) {
        element.currentTime = debut;
        return;
      }
      element.pause();
      setEnLecture(false);
    };
    const surMeta = (): void => setDureeLue(Number.isFinite(element.duration) ? element.duration : undefined);
    const surFin = (): void => setEnLecture(false);
    const surErreur = (): void => {
      setEnPanne(true);
      setEnLecture(false);
    };

    element.addEventListener("timeupdate", surTemps);
    element.addEventListener("loadedmetadata", surMeta);
    element.addEventListener("ended", surFin);
    element.addEventListener("error", surErreur);

    return () => {
      element.removeEventListener("timeupdate", surTemps);
      element.removeEventListener("loadedmetadata", surMeta);
      element.removeEventListener("ended", surFin);
      element.removeEventListener("error", surErreur);
      element.pause();
      element.removeAttribute("src");
      audio.current = null;
    };
  }, [source, debutS]);

  /** Le tempo suit son réglage, sur l'élément courant comme sur le suivant.
   *
   *  Posé dans son propre effet, et non à la lecture : changer le tempo pendant qu'on écoute doit
   *  s'entendre tout de suite, sans redémarrer le passage. */
  useEffect(() => {
    const element = audio.current;
    if (element === null) return;
    appliquerTempo(element, tempo);
  }, [tempo, source, debutS]);

  const arreter = useCallback(() => {
    audio.current?.pause();
    setEnLecture(false);
  }, []);

  const basculer = useCallback(() => {
    const element = audio.current;
    if (element === null) return;
    if (!element.paused) {
      element.pause();
      setEnLecture(false);
      return;
    }
    // Hors du segment — on vient d'en changer, ou la lecture s'est arrêtée à sa fin : on y
    // revient. Dedans, on reprend où l'on en était.
    const { debutS: debut, finS: fin } = bornes.current;
    if (element.currentTime < debut || (fin !== undefined && element.currentTime >= fin)) element.currentTime = debut;

    const promesse: unknown = element.play();
    setEnLecture(true);
    // Un navigateur rend une promesse ; un environnement de test peut ne rien rendre. On traite
    // les deux : un refus de lecture est un état normal, pas une exception à laisser filer.
    if (promesse instanceof Promise)
      promesse.catch(() => {
        setEnPanne(true);
        setEnLecture(false);
      });
  }, []);

  return {
    disponible: source !== undefined,
    enPanne,
    enLecture,
    positionS,
    dureeS: dureeLue ?? dureeAnnonceeS ?? 0,
    basculer,
    arreter,
  };
}
