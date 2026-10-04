import { z } from "zod";
import { Confiance } from "./commun.js";

/** Découpe d'un média en segments (A4, ANC-03).
 *
 *  Un média enchaîne plusieurs éléments séparés par des silences. Les repérer permet de situer
 *  chaque élément dans sa piste, et donc de commencer la lecture au bon endroit.
 *
 *  La règle qui commande tout : **aucune position de départ n'est inventée**. Un segment n'est
 *  « connu » que si on l'a vérifié ; sinon la lecture commence au début de la piste et le dit. */

/** Durée en secondes, au centième — la convention des ancres temporelles (ANC). */
const Secondes = z.number().nonnegative().multipleOf(0.01);

/** Un silence relevé dans un média : là où il se tait, et combien de temps. */
export const Silence = z
  .object({ debut: Secondes, fin: Secondes })
  .strict()
  .refine((silence) => silence.fin > silence.debut, { message: "La fin doit suivre le début", path: ["fin"] });
export type Silence = z.infer<typeof Silence>;

/** Un segment de média : de quand à quand, et à quel point on y croit. */
export const Segment = z
  .object({
    debut: Secondes,
    fin: Secondes,
    /** Confiance dans la découpe. Les silences qui la bornent sont-ils francs et longs ? */
    confiance: Confiance,
  })
  .strict()
  .refine((segment) => segment.fin > segment.debut, { message: "La fin doit suivre le début", path: ["fin"] });
export type Segment = z.infer<typeof Segment>;

/** Ce qu'on sait du découpage d'un média. */
export const DecoupeMedia = z
  .object({
    /** Durée totale, qui borne tous les segments. */
    dureeS: Secondes,
    segments: z.array(Segment),
  })
  .strict()
  .superRefine((decoupe, ctx) => {
    let precedent = -1;
    decoupe.segments.forEach((segment, rang) => {
      if (segment.debut < precedent)
        ctx.addIssue({ code: "custom", path: ["segments", rang], message: "Les segments se suivent sans se chevaucher" });
      if (segment.fin > decoupe.dureeS + 0.01)
        ctx.addIssue({ code: "custom", path: ["segments", rang], message: "Un segment ne dépasse pas la durée du média" });
      precedent = segment.fin;
    });
  });
export type DecoupeMedia = z.infer<typeof DecoupeMedia>;

/** Position de lecture d'un élément dans sa piste (ANC-03).
 *
 *  Deux cas, et deux seulement. Soit le segment est connu et on sait où commencer ; soit il ne
 *  l'est pas, la lecture commence au début de la piste, et l'interface le dit — « segment
 *  inconnu ». Il n'y a pas de troisième cas, et surtout pas de position approchée. */
export const PositionDansPiste = z.discriminatedUnion("segment", [
  z
    .object({ segment: z.literal("connu"), debut: Secondes, fin: Secondes, confiance: Confiance })
    .strict()
    .refine((position) => position.fin > position.debut, { message: "La fin doit suivre le début", path: ["fin"] }),
  z.object({ segment: z.literal("inconnu") }).strict(),
]);
export type PositionDansPiste = z.infer<typeof PositionDansPiste>;

/** Où commencer la lecture, en secondes. Un segment inconnu, c'est le début de la piste. */
export const departDeLecture = (position: PositionDansPiste): number =>
  position.segment === "connu" ? position.debut : 0;
