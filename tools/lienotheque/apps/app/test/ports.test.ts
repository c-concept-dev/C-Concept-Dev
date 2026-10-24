import { describe, expect, it } from "vitest";
import { administrationDuBureau, lectureDuBureau } from "../src/pont/bureau.js";
import { NOMS_DE_LECTURE, NOMS_D_ADMINISTRATION } from "../src/pont/port.js";

/** La frontière entre consulter et construire, vérifiée à l'exécution (PLT-02, PLT-03).
 *
 *  Le bureau **construit** une bibliothèque, la version en ligne **consulte** ce qu'il a produit.
 *  Les types le disent, mais un type disparaît à la compilation : il n'empêchera personne de
 *  glisser demain une écriture dans le port de lecture, ni d'y oublier une fonction en la
 *  déclarant. Ces contrôles-ci le peuvent.
 *
 *  Ils gardent une décision, pas une implémentation — c'est pourquoi ils énumèrent des noms.
 */

describe("deux ports, et une frontière qui tient", () => {
  it("le port de lecture porte exactement les sept fonctions décidées", () => {
    expect([...NOMS_DE_LECTURE].sort()).toEqual(
      [
        "apercuDeBibliotheque",
        "classementsDeBibliotheque",
        "classerDocument",
        "imageDePage",
        "passagesDeDocument",
        "versionActive",
        "vueDeDocument",
      ].sort(),
    );
  });

  it("rien de ce qui désigne un emplacement sur la machine n'est dans le port de lecture", () => {
    // « Quel dossier ouvrir ? » n'a pas de sens dans un navigateur. Le jour où l'une de ces
    // fonctions passerait la frontière, la version en ligne devrait feindre — et c'est
    // exactement ce que la scission refuse.
    for (const interdite of ["choisirDossier", "choisirFichiers", "deposer", "creerBibliotheque"])
      expect(NOMS_DE_LECTURE as readonly string[], `« ${interdite} » appartient au bureau`).not.toContain(interdite);
  });

  it("la file entière reste au bureau : l'écran Dépôt n'existe pas en ligne", () => {
    for (const deLaFile of ["faireTourner", "travauxDe", "agirSurTravail"])
      expect(NOMS_D_ADMINISTRATION as readonly string[]).toContain(deLaFile);
  });

  it("la relecture OCR d'une image locale reste une capacité du bureau", () => {
    expect(NOMS_D_ADMINISTRATION as readonly string[]).toContain("relireTexteDePage");
    expect(NOMS_DE_LECTURE as readonly string[]).not.toContain("relireTexteDePage");
  });

  it("aucune fonction n'appartient aux deux ports", () => {
    const communes = (NOMS_DE_LECTURE as readonly string[]).filter((nom) =>
      (NOMS_D_ADMINISTRATION as readonly string[]).includes(nom),
    );
    expect(communes, "une fonction des deux côtés n'a plus de frontière").toEqual([]);
  });

  it("ce qu'aucun écran n'appelle n'entre dans aucun port", () => {
    // L'inscrire obligerait la version en ligne à implémenter ce que personne ne demande.
    expect(NOMS_DE_LECTURE as readonly string[]).not.toContain("reglages");
    expect(NOMS_D_ADMINISTRATION as readonly string[]).not.toContain("reglages");
  });

  it("retirer une bibliothèque appartient à l'administration, et à elle seule", () => {
    // `oublierBibliotheque` a dormi longtemps hors des ports, faute d'appelant : l'hôte savait le
    // faire et aucun écran ne le proposait. L'écran de retrait l'a réveillée le 21 octobre 2026,
    // avec sa sœur destructrice. Les deux sont du bureau : on ne retire rien en ligne.
    for (const geste of ["oublierBibliotheque", "supprimerBibliotheque"]) {
      expect(NOMS_D_ADMINISTRATION as readonly string[]).toContain(geste);
      expect(NOMS_DE_LECTURE as readonly string[]).not.toContain(geste);
    }
  });

  it("« estBureau » n'est membre d'aucun port : elle choisit entre les deux", () => {
    expect(NOMS_DE_LECTURE as readonly string[]).not.toContain("estBureau");
    expect(NOMS_D_ADMINISTRATION as readonly string[]).not.toContain("estBureau");
  });

  it("le pont du bureau remplit les deux ports, sans rien de plus ni de moins", () => {
    expect(Object.keys(lectureDuBureau).sort()).toEqual([...NOMS_DE_LECTURE].sort());
    expect(Object.keys(administrationDuBureau).sort()).toEqual([...NOMS_D_ADMINISTRATION].sort());
  });

  it("chaque membre est bien une fonction, et non un export oublié", () => {
    // Un export absent vaut `undefined` : le type ne le voit pas si la clé est là, et l'appel
    // échouerait à l'exécution, loin d'ici.
    for (const [nom, valeur] of [...Object.entries(lectureDuBureau), ...Object.entries(administrationDuBureau)])
      expect(typeof valeur, `« ${nom} » n'est pas une fonction`).toBe("function");
  });
});
