/** Ce que le crochet exige d'un commit qui touche l'hôte Rust : **la suite entière et tous les
 *  exemples**, avant que le commit existe.
 *
 *  ## Pourquoi, et c'est la troisième fois
 *
 *  Demandé par Christophe le 16 novembre 2026 : « quand un commit touche
 *  `apps/app/src-tauri`, le contrôle complet (ou le crochet de pré-commit) lance `cargo test`
 *  (suite entière) **et** `cargo build --examples`, et refuse s'il échoue. C'est la troisième
 *  erreur Rust découverte après le push. »
 *
 *  La dernière, le 16 novembre : `Refus` avait remplacé une `String` dans un rappel, et **douze
 *  endroits** — huit exemples et un test d'intégration — formataient encore l'ancien type. J'avais
 *  lancé `cargo test --lib` : **165 contrôles verts**. `cargo test --lib` **ne compile aucun
 *  exemple**, et la course l'a trouvé après la poussée.
 *
 *  ## Pourquoi les deux commandes, et jamais une seule
 *
 *  Elles ne se recouvrent pas, et la faute du jour le prouve : `cargo test` compile la
 *  bibliothèque et les tests, **pas les exemples** ; `cargo build --examples` compile les exemples
 *  mais n'exécute rien. Une suite verte au-dessus d'un exemple cassé est exactement ce qui est
 *  arrivé. Les deux sont donc lancées **toutes les deux**, même si la première échoue : un crochet
 *  qui s'arrête à la première faute fait recommencer le commit autant de fois qu'il y a de fautes,
 *  et c'est la règle déjà écrite de ce crochet.
 *
 *  ## Le prix, mesuré avant d'être imposé
 *
 *  Le commentaire de `avant-commit` disait : « un crochet qui prendrait vingt-cinq minutes serait
 *  désactivé avant la fin de la journée ». La règle tient toujours, et c'est pourquoi le prix a
 *  été mesuré d'abord, sur le cas le plus coûteux — une source de l'hôte vient de changer, donc
 *  tout se recompile en aval. Voir `PRIX_MESURE` ci-dessous.
 *
 *  Et ce prix n'est payé que par les commits qui touchent l'hôte Rust. Les autres ne lancent
 *  rien : la liste des chemins décide, et elle est lue dans l'index.
 *
 *  ## Pourquoi tout `apps/app/src-tauri/`, et pas seulement `src/`
 *
 *  Parce que `outils/preparer-moteurs.py` et `outils/preparer-moteur-node.py` **fabriquent les
 *  moteurs que la suite emploie**, et que `Cargo.toml`, `tauri.conf.json` et `rust-toolchain.toml`
 *  décident de ce qui compile. Un filtre sur `src/` aurait laissé passer la moitié des causes. */

/** Le dossier qui déclenche l'épreuve, tel que l'index l'écrit. */
export const DOSSIER_RUST = "apps/app/src-tauri/";

/** Le prix relevé le 16 novembre 2026 sur cette machine, après `touch` d'une source de l'hôte :
 *  `cargo build --examples` puis `cargo test` sur la suite entière. **Donnée, pour qu'on puisse la
 *  contredire par une autre mesure plutôt que par une impression.** */
export const PRIX_MESURE = {
  commentaire: "relevé le 16 novembre 2026, après changement d'une source de l'hôte",
  exemples_secondes: 9,
  suite_secondes: 45,
  secondes: 54,
} as const;

/** Une épreuve à lancer : son nom en français, le programme, ses arguments. **Donnée** — on en
 *  ajoute une en allongeant cette liste, sans toucher à la décision. */
export interface EpreuveRust {
  readonly nom: string;
  readonly programme: string;
  readonly arguments: readonly string[];
}

const MANIFESTE = `${DOSSIER_RUST}Cargo.toml`;

export const EPREUVES_RUST: readonly EpreuveRust[] = [
  // Les exemples d'abord : c'est la faute du jour, et la moins chère à voir.
  { nom: "compiler tous les exemples", programme: "cargo", arguments: ["build", "--manifest-path", MANIFESTE, "--examples"] },
  { nom: "la suite entière", programme: "cargo", arguments: ["test", "--manifest-path", MANIFESTE] },
];

/** Ce qu'une épreuve a rendu. */
export interface Lancement {
  readonly code: number;
  /** Les dernières lignes de sa sortie, pour que le refus montre la cause et non un code nu. */
  readonly sortie: string;
}

/** Les chemins de l'index qui touchent l'hôte Rust. Vide quand le commit ne le touche pas. */
export function rustAEprouver(suivis: readonly string[]): readonly string[] {
  return suivis.filter((chemin) => chemin.startsWith(DOSSIER_RUST));
}

/** Le refus des épreuves Rust, en français. Vide quand toutes passent.
 *
 *  `lancer` est donné du dehors : la décision s'éprouve ainsi sans cargo, et le script lui passe
 *  le vrai lanceur. */
export function refusDesEpreuvesRust(
  chemins: readonly string[],
  lancer: (epreuve: EpreuveRust) => Lancement,
): readonly string[] {
  if (chemins.length === 0) return [];
  const refus: string[] = [];
  for (const epreuve of EPREUVES_RUST) {
    const rendu = lancer(epreuve);
    if (rendu.code === 0) continue;
    const commande = `${epreuve.programme} ${epreuve.arguments.join(" ")}`;
    refus.push(
      `l'hôte Rust : ${epreuve.nom} a échoué (code ${rendu.code})\n      ${commande}\n` +
        rendu.sortie
          .split("\n")
          .filter((ligne) => ligne.trim().length > 0)
          .slice(-6)
          .map((ligne) => `      ${ligne}`)
          .join("\n"),
    );
  }
  return refus;
}

/** Le refus quand l'index et le disque ne disent pas la même chose sous l'hôte Rust.
 *
 *  `cargo` compile **le disque**, là où ce crochet juge **l'index**. Si les deux diffèrent, le
 *  verdict de cargo ne décrit pas le commit : c'est la classe « mesure fausse » exactement, et
 *  elle se refuse plutôt que s'annoter. */
export function refusDeLEcartAuDisque(nonIndexes: readonly string[]): readonly string[] {
  const sousRust = nonIndexes.filter((chemin) => chemin.startsWith(DOSSIER_RUST));
  if (sousRust.length === 0) return [];
  return [
    `l'hôte Rust : ${sousRust.length} chemin(s) modifié(s) hors de l'index — cargo juge le DISQUE,` +
      ` ce crochet juge l'INDEX, et les deux diffèrent :\n` +
      sousRust.map((chemin) => `      ${chemin}`).join("\n") +
      `\n      Indexez-les, ou sortez-les du dossier : un verdict de cargo sur un autre arbre ne dit rien du commit.`,
  ];
}
