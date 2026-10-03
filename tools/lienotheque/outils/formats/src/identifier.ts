import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, readFileSync, realpathSync } from "node:fs";
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

/** Comment Siegfried a tranché. Une correspondance d'octets l'emporte toujours sur l'extension :
 *  « extension match pdf; byte match at … » est une preuve de contenu, pas de nom (FMT-01). */
export function preuveDepuisBase(base: string): "signature" | "conteneur" | "extension" {
  if (/container/i.test(base)) return "conteneur";
  if (/byte match|signature/i.test(base)) return "signature";
  if (/extension/i.test(base)) return "extension";
  return "signature";
}

export type OptionsSiegfried = { readonly binaire?: string; readonly signature?: string | undefined };

/** Siegfried reçoit le chemin réel, liens symboliques résolus : sur macOS `/tmp` est un lien vers
 *  `/private/tmp`, et un processus fils n'a pas forcément le droit de le suivre. */
function cheminReel(chemin: string): string {
  try {
    return realpathSync(chemin);
  } catch {
    return chemin;
  }
}

/** Interroge Siegfried s'il est joignable. `undefined` sinon : ce n'est pas une erreur. */
export function parSiegfried(chemin: string, options: OptionsSiegfried = {}): Dit | undefined {
  const binaire = options.binaire ?? "sf";
  try {
    const reel = cheminReel(chemin);
    const arguments_ = options.signature === undefined ? ["-json", reel] : ["-sig", options.signature, "-json", reel];
    const sortie = execFileSync(binaire, arguments_, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const rapport = JSON.parse(sortie) as {
      files?: { matches?: { ns?: string; id?: string; format?: string; mime?: string; basis?: string }[] }[];
    };
    const trouve = rapport.files?.[0]?.matches?.find((m) => m.ns === "pronom" && m.id !== undefined && m.id !== "UNKNOWN");
    if (trouve === undefined) return undefined;
    return {
      pronom: trouve.id,
      nom: trouve.format ?? trouve.id ?? "inconnu",
      typeMime: trouve.mime !== undefined && trouve.mime !== "" ? trouve.mime : "application/octet-stream",
      preuve: preuveDepuisBase(trouve.basis ?? ""),
    };
  } catch {
    return undefined;
  }
}

export type OptionsIdentification = {
  /** Binaire Siegfried embarqué ; par défaut celui du système, s'il y en a un. */
  readonly siegfried?: string | undefined;
  /** Fichier de signatures PRONOM embarqué avec lui. */
  readonly signatureSiegfried?: string | undefined;
};

export async function identifier(chemin: string, options: OptionsIdentification = {}): Promise<IdentificationFormat> {
  const empreinte = await empreinteDe(chemin);
  const entete = Buffer.alloc(TAILLE_ENTETE);
  const descripteur = await import("node:fs/promises").then((fs) => fs.open(chemin, "r"));
  const { bytesRead } = await descripteur.read(entete, 0, TAILLE_ENTETE, 0);
  await descripteur.close();
  const debut = entete.subarray(0, bytesRead);

  const extension = extname(chemin).replace(".", "").toLowerCase();
  const signature = formatParSignature(debut);
  const registre = parSiegfried(chemin, {
    ...(options.siegfried === undefined ? {} : { binaire: options.siegfried }),
    ...(options.signatureSiegfried === undefined ? {} : { signature: options.signatureSiegfried }),
  });

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
export function siegfriedDisponible(options: OptionsSiegfried = {}): boolean {
  try {
    const binaire = options.binaire ?? "sf";
    const arguments_ = options.signature === undefined ? ["-version"] : ["-sig", options.signature, "-version"];
    execFileSync(binaire, arguments_, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Moteurs embarqués par `preparer-moteurs.py`, s'ils sont là. */
export function moteursEmbarques(racine: string): OptionsIdentification {
  const binaire = `${racine}/bin/${process.platform === "win32" ? "sf.exe" : "sf"}`;
  const signature = `${racine}/siegfried/default.sig`;
  return siegfriedDisponible({ binaire, signature }) ? { siegfried: binaire, signatureSiegfried: signature } : {};
}

export const lireEntete = (chemin: string): Buffer => readFileSync(chemin).subarray(0, TAILLE_ENTETE);
