/** Signatures de contenu, en données : ajouter un format, c'est ajouter une ligne.
 *
 *  Ce n'est pas le registre PRONOM — c'est le repli quand Siegfried n'est pas embarqué. Il
 *  reconnaît le format par ses octets et rend son type de média ; l'identifiant PRONOM, lui,
 *  ne vient que du registre (FMT-01). */

export type Signature = {
  readonly nom: string;
  readonly typeMime: string;
  /** Octets attendus, en hexadécimal, à partir de `decalage`. */
  readonly motif: string;
  readonly decalage?: number;
  /** Extensions habituelles : simple indice, jamais une preuve. */
  readonly extensions: readonly string[];
};

export const SIGNATURES: readonly Signature[] = [
  { nom: "PDF", typeMime: "application/pdf", motif: "25504446", extensions: ["pdf"] },
  { nom: "PNG", typeMime: "image/png", motif: "89504e470d0a1a0a", extensions: ["png"] },
  { nom: "JPEG", typeMime: "image/jpeg", motif: "ffd8ff", extensions: ["jpg", "jpeg"] },
  { nom: "GIF", typeMime: "image/gif", motif: "474946383961", extensions: ["gif"] },
  { nom: "GIF", typeMime: "image/gif", motif: "474946383761", extensions: ["gif"] },
  { nom: "TIFF", typeMime: "image/tiff", motif: "49492a00", extensions: ["tif", "tiff"] },
  { nom: "TIFF", typeMime: "image/tiff", motif: "4d4d002a", extensions: ["tif", "tiff"] },
  { nom: "WebP", typeMime: "image/webp", motif: "57454250", decalage: 8, extensions: ["webp"] },
  { nom: "HEIF", typeMime: "image/heic", motif: "66747970686569", decalage: 4, extensions: ["heic", "heif"] },
  { nom: "MP3", typeMime: "audio/mpeg", motif: "fffb", extensions: ["mp3"] },
  { nom: "MP3", typeMime: "audio/mpeg", motif: "fff3", extensions: ["mp3"] },
  { nom: "MP3", typeMime: "audio/mpeg", motif: "494433", extensions: ["mp3"] },
  { nom: "WAV", typeMime: "audio/wav", motif: "57415645", decalage: 8, extensions: ["wav"] },
  { nom: "FLAC", typeMime: "audio/flac", motif: "664c6143", extensions: ["flac"] },
  { nom: "OGG", typeMime: "audio/ogg", motif: "4f676753", extensions: ["ogg", "oga", "opus"] },
  { nom: "MP4", typeMime: "video/mp4", motif: "66747970", decalage: 4, extensions: ["mp4", "m4a", "mov"] },
  { nom: "Matroska", typeMime: "video/x-matroska", motif: "1a45dfa3", extensions: ["mkv", "webm"] },
  { nom: "RTF", typeMime: "application/rtf", motif: "7b5c727466", extensions: ["rtf"] },
  { nom: "Archive ZIP", typeMime: "application/zip", motif: "504b0304", extensions: ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"] },
];

/** Dans un conteneur ZIP, le premier fichier dit souvent de quoi il s'agit (FMT-01). */
export const CONTENEURS_ZIP: readonly { readonly indice: string; readonly nom: string; readonly typeMime: string }[] = [
  { indice: "mimetypeapplication/epub+zip", nom: "EPUB", typeMime: "application/epub+zip" },
  { indice: "mimetypeapplication/vnd.oasis.opendocument.text", nom: "ODT", typeMime: "application/vnd.oasis.opendocument.text" },
  { indice: "mimetypeapplication/vnd.oasis.opendocument.spreadsheet", nom: "ODS", typeMime: "application/vnd.oasis.opendocument.spreadsheet" },
  { indice: "mimetypeapplication/vnd.oasis.opendocument.presentation", nom: "ODP", typeMime: "application/vnd.oasis.opendocument.presentation" },
  { indice: "word/", nom: "DOCX", typeMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { indice: "xl/", nom: "XLSX", typeMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { indice: "ppt/", nom: "PPTX", typeMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
];
