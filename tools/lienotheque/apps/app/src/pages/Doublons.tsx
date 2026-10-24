import { useState, type JSX } from "react";
import type { DocumentSuspect, Doublons as DoublonsTrouves } from "@lienotheque/contrats";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import "./Doublons.css";

/** Ce qui se trouve deux fois dans une bibliothèque — décrit, jamais effacé (HER-07, HER-08).
 *
 *  ## La forme vient d'un écran qui a fait ses preuves
 *
 *  Un bouton qui cherche, des groupes qui décrivent, un retrait demandé **document par
 *  document**. Rien ne part en lot, et rien ne part sans qu'on l'ait désigné.
 *
 *  ## Pourquoi décrire et ne pas trancher
 *
 *  La ressemblance se mesure sur le texte, et le texte **ne distingue pas** un vrai doublon d'un
 *  même ouvrage en deux formats : deux numérisations d'un livre se ressemblent à 96 %, le même
 *  livre en EPUB et en PDF à 99 %. Garder l'EPUB pour lire et le PDF pour citer est un choix
 *  légitime ; garder les deux mises en page d'un diaporama aussi.
 *
 *  Un écran qui effacerait « les doublons » emporterait donc des documents qu'on voulait garder,
 *  et il n'y a aucune mesure qui l'en empêcherait. D'où ce parti : cet écran donne **ce qui
 *  distingue** les membres d'un groupe — leur nom, leurs pages, leurs passages, leurs mots, leur
 *  poids — et laisse décider.
 *
 *  ## Le retrait s'arme, il ne se confirme pas dans une fenêtre
 *
 *  Un premier clic arme, un second retire : une fenêtre de confirmation se ferme d'un clic
 *  distrait, et n'apprend rien de plus. Et ce qui part va **à la corbeille**, d'où il se ressort :
 *  se tromper de document ne doit pas coûter un livre. C'est écrit à l'écran, parce qu'une
 *  personne qui sait son geste réversible le fait sans angoisse.
 */

type Props = {
  readonly nom: string;
  readonly onChercher: () => void;
  readonly onRetirer: (empreinte: string) => void;
  readonly onRetour: () => void;
  /** Ce que la recherche a rendu. Absent tant qu'elle n'a pas été lancée — et c'est différent
   *  d'une recherche qui n'a rien trouvé, qu'il ne faut pas annoncer à sa place. */
  readonly trouves?: DoublonsTrouves | undefined;
  readonly occupe?: boolean | undefined;
  readonly echec?: string | undefined;
  /** Ce qui vient d'être retiré, pour le dire au lieu de laisser la liste se raccourcir en silence. */
  readonly retire?: string | undefined;
};

/** Un poids que l'on lit. Les octets bruts d'un livre ne disent rien à personne. */
function poids(octets: number): string {
  if (octets === 0) return "source absente";
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  // Une décimale toujours sous dix mégaoctets, et jamais au-delà : « 2,1 Mo » suivi de « 2 Mo »
  // se compare mal, alors que c'est précisément pour comparer qu'on lit cette colonne.
  const mo = octets / 1024 / 1024;
  const chiffres = mo < 10 ? 1 : 0;
  return `${mo.toLocaleString("fr-FR", { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres })} Mo`;
}

const nombre = (combien: number): string => combien.toLocaleString("fr-FR");

/** Une ligne de document : ce qui le distingue, et le geste qui le retire. */
function Ligne({
  document: suspect,
  arme,
  onArmer,
  onRetirer,
  occupe,
}: {
  readonly document: DocumentSuspect;
  readonly arme: boolean;
  readonly onArmer: () => void;
  readonly onRetirer: () => void;
  readonly occupe: boolean;
}): JSX.Element {
  return (
    <li className="ln-doublons__ligne">
      <div className="ln-doublons__quoi">
        <span className="ln-doublons__nom">{suspect.nom}</span>
        <span className="ln-doublons__faits">
          {nombre(suspect.pages)} pages · {nombre(suspect.passages)} passages · {nombre(suspect.mots)} mots ·{" "}
          {poids(suspect.octets)}
        </span>
      </div>
      {arme ? (
        <Bouton variante="principal" onClick={onRetirer} disabled={occupe}>
          Confirmer le retrait
        </Bouton>
      ) : (
        <Bouton onClick={onArmer} disabled={occupe}>
          Retirer
        </Bouton>
      )}
    </li>
  );
}

export function Doublons({
  nom,
  onChercher,
  onRetirer,
  onRetour,
  trouves,
  occupe,
  echec,
  retire,
}: Props): JSX.Element {
  // Un seul document armé à la fois : deux boutons « Confirmer » côte à côte invitent à se
  // tromper, et ce sont justement des documents qui se ressemblent.
  const [arme, setArme] = useState<string | undefined>(undefined);
  const enCours = occupe === true;

  return (
    <main id="contenu" className="ln-layout ln-doublons" tabIndex={-1}>
      <FilAriane
        chemin={[{ libelle: "Accueil", href: "#" }, { libelle: nom, href: "#catalogue" }, { libelle: "Doublons" }]}
      />

      <h1 className="ln-doublons__titre">Ce qui se trouve deux fois</h1>
      <p className="ln-doublons__propos">
        Liénothèque compare le texte de vos documents et vous montre ceux qui disent la même chose.{" "}
        <strong>Elle n’en retire aucun d’elle-même</strong>&nbsp;: un même ouvrage en deux formats se ressemble autant
        qu’une vraie copie, et garder l’un et l’autre est souvent le bon choix. À vous de trancher, document par
        document.
      </p>

      <Bouton variante="principal" onClick={onChercher} disabled={enCours}>
        {enCours ? "Je lis la bibliothèque…" : "Chercher les doublons"}
      </Bouton>

      {echec === undefined ? null : (
        <p className="ln-doublons__echec" role="alert">
          <Icone nom="alerte" />
          {echec}
        </p>
      )}

      {retire === undefined ? null : (
        <p className="ln-doublons__fait" role="status">
          <Icone nom="corbeille" />
          {retire}
        </p>
      )}

      {trouves === undefined ? null : trouves.groupes.length === 0 ? (
        <p className="ln-doublons__rien">
          <Icone nom="valide" />
          Aucun document n’en double un autre.
        </p>
      ) : (
        trouves.groupes.map((groupe) => (
          <section
            key={groupe.documents.map((document) => document.empreinte).join("-")}
            className="ln-panneau ln-doublons__groupe"
          >
            <h2 className="ln-doublons__sous-titre">
              {groupe.documents.length} documents se ressemblent à{" "}
              {Math.round(groupe.ressemblance * 100).toLocaleString("fr-FR")}&nbsp;%
            </h2>
            <ul className="ln-doublons__lignes">
              {groupe.documents.map((suspect) => (
                <Ligne
                  key={suspect.empreinte}
                  document={suspect}
                  arme={arme === suspect.empreinte}
                  onArmer={() => setArme(suspect.empreinte)}
                  onRetirer={() => {
                    setArme(undefined);
                    onRetirer(suspect.empreinte);
                  }}
                  occupe={enCours}
                />
              ))}
            </ul>
            <p className="ln-doublons__ou">
              Ce qui part va <strong>à la corbeille</strong>, d’où vous pourrez le ressortir.
            </p>
          </section>
        ))
      )}

      {trouves === undefined || trouves.tropPeuDeTexte.length === 0 ? null : (
        <section className="ln-panneau ln-doublons__groupe ln-doublons__groupe--maigre">
          <h2 className="ln-doublons__sous-titre">
            {trouves.tropPeuDeTexte.length} documents n’ont pas pu être comparés
          </h2>
          <p className="ln-doublons__propos">
            Liénothèque n’a presque rien lu de leur texte, et deux textes de cent mots se ressemblent toujours&nbsp;:
            les comparer dirait n’importe quoi. Ils sont peut-être numérisés sans avoir été relus&nbsp;— une lecture de
            l’image leur rendrait leur texte.
          </p>
          <ul className="ln-doublons__lignes">
            {trouves.tropPeuDeTexte.map((suspect) => (
              <Ligne
                key={suspect.empreinte}
                document={suspect}
                arme={arme === suspect.empreinte}
                onArmer={() => setArme(suspect.empreinte)}
                onRetirer={() => {
                  setArme(undefined);
                  onRetirer(suspect.empreinte);
                }}
                occupe={enCours}
              />
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="ln-lien-action" onClick={onRetour}>
        Revenir au catalogue
      </button>
    </main>
  );
}
