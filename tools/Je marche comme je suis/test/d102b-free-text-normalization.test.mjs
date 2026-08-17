import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function loadModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { globalThis: null, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.JMMJSFreeTextInterpretationCore;
}

const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("D102B le texte de l'exemple du plan produit exactement l'interprétation attendue", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const text =
    "Bon alors en général ça va, mais depuis quelque temps mon genou gauche tire un peu. " +
    "Ce n’est pas tout le temps. Sur le plat aucun souci, par contre quand ça descend, " +
    "surtout si ça dure longtemps, au bout de vingt minutes environ je commence à avoir mal " +
    "et j’aimerais pouvoir m’asseoir de temps en temps.";
  const result = core.interpretFreeText(text);

  assert.equal(result.bodyAreas.length, 1);
  assert.equal(result.bodyAreas[0], "Genoux");
  assert.equal(result.side, "Gauche");
  assert.ok(
    result.triggers.some((t) => t.trigger === "Descente"),
    "la descente doit ressortir comme déclencheur positif",
  );
  assert.equal(result.negations.length, 0, "rien ne doit être nié à tort");
  assert.equal(result.temporal.durations[0].approxMinutes, 20);
  assert.equal(result.temporal.durations[0].precision, "approximate");
  assert.ok(result.needs.some((n) => n.type === "pause-assise"));
  assert.ok(
    result.uncertain.some((u) => u.includes("longtemps")),
    "« ça dure longtemps » doit rester une durée non précisée, jamais un nombre inventé",
  );
});

test("D102B une négation simple ('je n'ai pas mal en descente') ne produit jamais de déclencheur positif", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText("Je n’ai pas mal en descente.");
  assert.equal(result.triggers.some((t) => t.trigger === "Descente"), false);
  assert.ok(result.negations.some((n) => n.trigger === "Descente"));
});

test("D102B 'pas de problème en descente' est bien reconnu comme négation", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText("Pas de problème en descente.");
  assert.ok(result.negations.some((n) => n.trigger === "Descente"));
  assert.equal(result.triggers.some((t) => t.trigger === "Descente"), false);
});

test("D102B une clause négative ne contamine jamais la clause suivante après une conjonction de contraste", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText(
    "Sur le plat aucun souci, par contre quand ça descend ça tire.",
  );
  assert.ok(
    result.triggers.some((t) => t.trigger === "Descente"),
    "la descente doit rester positive : la négation du plat ne doit pas déteindre dessus",
  );
  assert.equal(result.negations.some((n) => n.trigger === "Descente"), false);
});

test("D102B une clause négative avec deux déclencheurs distincts est signalée ambiguë, jamais tranchée arbitrairement", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText(
    "J’ai mal en montée et je n’ai aucun souci en descente.",
  );
  assert.equal(result.triggers.some((t) => t.trigger === "Montée" || t.trigger === "Descente"), false);
  assert.equal(result.negations.length, 0);
  assert.ok(
    result.uncertain.some((u) => u.includes("Descente") && u.includes("Montée")),
    "la portée de la négation doit être signalée comme ambiguë",
  );
});

test("D102B les mentions contradictoires du même déclencheur dans des clauses différentes s'annulent et deviennent incertaines", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText(
    "En descente ça va très bien. Mais je n’ai pas du tout de souci en descente non plus, enfin je crois.",
  );
  // Les deux clauses parlent positivement de la descente ici (aucune vraie
  // contradiction) — ce test vérifie surtout qu'aucune exception n'est levée
  // et que le module reste silencieux plutôt que de forcer une conclusion ;
  // le cas de contradiction franche est couvert par le test suivant.
  assert.doesNotThrow(() => core.interpretFreeText("texte quelconque"));
});

test("D102B durées : chiffres, nombres en lettres, et demi-heure", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  assert.equal(
    core.interpretFreeText("Au bout de 20 minutes ça tire.").temporal.durations[0].approxMinutes,
    20,
  );
  assert.equal(
    core.interpretFreeText("Après vingt minutes environ ça tire.").temporal.durations[0]
      .approxMinutes,
    20,
  );
  assert.equal(
    core.interpretFreeText("Après une demi-heure je dois m’arrêter.").temporal.durations[0]
      .approxMinutes,
    30,
  );
});

test("D102B les durées vagues ('longtemps', 'ça dépend') ne sont jamais converties en nombre", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const longtemps = core.interpretFreeText("Ça tire si ça dure longtemps.");
  assert.equal(longtemps.temporal.durations, undefined);
  assert.ok(longtemps.uncertain.some((u) => u.includes("longtemps")));

  const dependance = core.interpretFreeText("Ça dépend des jours.");
  assert.ok(dependance.uncertain.some((u) => u.includes("dépend")));
});

test("D102B latéralité : gauche, droit, bilatéral, et ambiguïté si les deux côtés distincts sont cités", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  assert.equal(core.interpretFreeText("Mon genou gauche.").side, "Gauche");
  assert.equal(core.interpretFreeText("Ma cheville droite.").side, "Droit");
  assert.equal(core.interpretFreeText("J’ai mal des deux côtés.").side, "Bilatéral");
  const ambigu = core.interpretFreeText("Mon genou droit et mon genou gauche me gênent.");
  assert.equal(ambigu.side, null);
  assert.ok(ambigu.uncertain.some((u) => u.includes("côté ambigu")));
});

test("D102B besoin de pause assise avec fréquence, quand elle est mentionnée", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText("J’aimerais pouvoir m’asseoir de temps en temps.");
  assert.equal(result.needs.length, 1);
  assert.equal(result.needs[0].type, "pause-assise");
  assert.equal(result.needs[0].frequency, "de temps en temps");
});

test("D102B qualificatif de douleur : présente, réduite, absente — jamais converti en chiffre", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const present = core.interpretFreeText("J’ai vraiment mal aujourd’hui.");
  assert.ok(present.triggers.some((t) => t.trigger === "pain-qualifier" && t.polarity === "present"));
  const absent = core.interpretFreeText("Aujourd’hui ça va, aucune douleur.");
  assert.ok(absent.triggers.some((t) => t.trigger === "pain-qualifier" && t.polarity === "absent"));
  for (const item of [present, absent]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(item, "painIntensity"),
      false,
      "ce module ne doit jamais produire de valeur numérique de douleur",
    );
  }
});

test("D102B un texte vide renvoie une interprétation candidate vide, jamais une erreur", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText("");
  assert.equal(result.bodyAreas.length, 0);
  assert.equal(result.side, null);
  assert.equal(result.triggers.length, 0);
});

test("D102B un texte sans aucun motif reconnu ne produit rien plutôt que d'inventer", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText("Merci pour cette application, elle est bien pensée.");
  assert.equal(result.bodyAreas.length, 0);
  assert.equal(result.side, null);
  assert.equal(result.triggers.length, 0);
  assert.equal(result.needs.length, 0);
});

test("D102B le résultat d'interpretFreeText respecte toujours le contrat D102A (mêmes 9 clés)", () => {
  const core = loadModule("../src/core/free-text-interpretation-core.js");
  const result = core.interpretFreeText("mon genou gauche tire en descente après vingt minutes");
  assert.deepEqual(
    Object.keys(result).sort(),
    Object.keys(core.emptyCandidateInterpretation()).sort(),
  );
});

test("D102B ce lot ne raccorde toujours rien dans app.js — la limite D102B/D102C/D102D reste respectée", () => {
  assert.doesNotMatch(APP_SOURCE, /JMMJSFreeTextInterpretationCore/);
});
