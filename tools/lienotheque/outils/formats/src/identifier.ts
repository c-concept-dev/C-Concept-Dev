import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { extname } from "node:path";
import { IdentificationFormat, type Empreinte } from "@lienotheque/contrats";
import { CONTENEURS_ZIP, SIGNATURES } from "./signatures.js";

/** Identification d'un fichier par son contenu (FMT-01).
 *
 *  Siegfried, quand il est embarqué, fait autorité : c'est lui qui porte le registre PRONOM.
 *  Sinon, les signatures intégrées reconnaissent le format et son type de média, sans prétendre
 *  à un identifiant de registre. Dans les deux cas l'extension n'est qu'un indice : quand elle
 *  contredit le contenu, le contenu l'emporte et le fichier est signalé. */

export const TAILLE_ENTETE = 4096;

export async function empreinteDe(chemin: string): Promise<Empreinte> {
  const hachage = createHash("sha256");
  for await (const morceau of createReadStream(chemin)) hachage.update(morceau as Buffer);
  return hachage.digest("hex");
}

const hex = (octets: Buffer): string => octets.toString("hex");

/** Nom du format d'après ses octets, sans registre. */
export function formatParSignature(entete: Buffer): { nom: string; typeMime: string; extensions: readonly string[] } | undefined {
  const debut = hex(entete);
  for (const signature of SIGNATURES) {
    const decalage = (signature.decalage ?? 0) * 2;
    if (debut.startsWith(signature.motif, decalage)) {
      if (signature.typeMime !== "application/zip") return signature;
      const texte = entete.toString("latin1");
      const conteneur = CONTENEURS_ZIP.find((c) => texte.includes(c.indice));
      return conteneur === undefined ? signature : { ...conteneur, extensions: signature.extensions };
    }
  }
  return undefined;
}

type Dit = { pronom?: string | undefined; nom: string; typeMime: string; preuve: "signature" | "conteneur" | "extension" };

/** Interroge Siegfried s'il est joignable. `undefined` sinon : ce n'est pas une erreur. */
export function parSiegfried(chemin: string, binaire = "sf"): Dit | undefined {
  try {
    const sortie = execFileSync(binaire, ["-json", chemin], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const rapport = JSON.parse(sortie) as {
      files?: { matches?: { ns?: string; id?: string; format?: string; mime?: string; basis?: string }[] }[];
    };
    const trouve = rapport.files?.[0]?.matches?.find((m) => m.ns === "pronom" && m.id !== undefined && m.id !== "UNKNOWN");
    if (trouve === undefined) return undefined;
    const preuve = /container/i.test(trouve.basis ?? "") ? "conteneur" : /extension/i.test(trouve.basis ?? "") ? "extension" : "signature";
    return {
      pronom: trouve.id,
      nom: trouve.format ?? trouve.id ?? "inconnu",
      typeMime: trouve.mime !== undefined && trouve.mime !== "" ? trouve.mime : "application/octet-stream",
      preuve,
    };
  } catch {
    return undefined;
  }
}

export type OptionsIdentification = { readonly siegfried?: string | undefined };

export async function identifier(chemin: string, options: OptionsIdentification = {}): Promise<IdentificationFormat> {
  const empreinte = await empreinteDe(chemin);
  const entete = Buffer.alloc(TAILLE_ENTETE);
  const descripteur = await import("node:fs/promises").then((fs) => fs.open(chemin, "r"));
  const { bytesRead } = await descripteur.read(entete, 0, TAILLE_ENTETE, 0);
  await descripteur.close();
  const debut = entete.subarray(0, bytesRead);

  const extension = extname(chemin).replace(".", "").toLowerCase();
  const signature = formatParSignature(debut);
  const registre = parSiegfried(chemin, options.siegfried ?? "sf");

  const dit: Dit | undefined = registre ?? (signature === undefined ? undefined : { ...signature, preuve: "signature" });
  const attendues = signature?.extensions ?? [];
  const extensionTrompeuse = extension !== "" && attendues.length > 0 && !attendues.includes(extension);

  return IdentificationFormat.parse({
    empreinte,
    ...(dit?.pronom === undefined ? {} : { pronom: dit.pronom }),
    nom: dit?.nom ?? "Format inconnu",
    typeMime: dit?.typeMime ?? "application/octet-stream",
    preuve: dit?.preuve ?? "inconnu",
    extensionTrompeuse,
    outil: registre === undefined ? "signatures intégrées" : "siegfried",
  });
}

/** Siegfried est-il joignable ? Sert à annoncer ce que l'on sait faire, pas à refuser. */
export function siegfriedDisponible(binaire = "sf"): boolean {
  try {
    execFileSync(binaire, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const lireEntete = (chemin: string): Buffer => readFileSync(chemin).subarray(0, TAILLE_ENTETE);
