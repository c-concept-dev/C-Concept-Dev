// COMPLÉMENT 5, POINT 4 — MESURE PAR AVFOUNDATION
//
// AVFoundation est la pile média d'Apple. Elle est plus proche d'un lecteur qu'afconvert, qui ne
// lit qu'un train audio : AVAssetReader travaille sur la composition, donc sur la TIMELINE ÉDITÉE,
// listes d'édition comprises. C'est le meilleur indice disponible sans interface graphique.
//
// CE QUE CETTE MESURE NE DÉMONTRE PAS, et il faut le dire avant les chiffres : elle ne dit RIEN du
// comportement de QuickTime Player, ni du <video> de Safari, ni de celui de Chrome. Ces lecteurs
// ont leur propre chaîne de rendu et leur propre synchronisation audio-vidéo. Seule l'écoute de
// Christophe les départagera.
//
// (a) AVAssetTrack.segments de la piste audio et de la piste vidéo : le segment porte le
//     timeMapping, soit la correspondance entre temps de source et temps de présentation. C'est là
//     que se lit l'effet d'une liste d'édition, s'il y en a un.
// (b) Lecture de l'audio par AVAssetReader, détection de l'attaque du bip par LA MÊME MÉTHODE que
//     outils/attaque.cjs : seuil à 25 % du pic local, dans une fenêtre autour de l'instant visé,
//     premier échantillon qui le dépasse — jamais le pic, dont l'enveloppe décale le maximum de
//     20 ms.

import AVFoundation
import Foundation

let INSTANTS: [Double] = [1, 5, 9]
let FENETRE = 0.45
let SEUIL_RELATIF: Float = 0.25

func fmt(_ x: Double, _ d: Int = 2) -> String { String(format: "%.\(d)f", x) }

// Même détection que attaque.cjs : seuil relatif au pic LOCAL, premier dépassement.
func attaque(_ pcm: [Float], _ se: Double, _ instant: Double) -> Double? {
    let d0 = max(0, Int((instant - FENETRE) * se))
    let d1 = min(pcm.count, Int((instant + FENETRE) * se))
    if d0 >= d1 { return nil }
    var pic: Float = 0
    for i in d0..<d1 { let a = abs(pcm[i]); if a > pic { pic = a } }
    let seuil = pic * SEUIL_RELATIF
    if seuil == 0 { return nil }
    for i in d0..<d1 where abs(pcm[i]) > seuil { return Double(i) / se }
    return nil
}

func decrireSegments(_ piste: AVAssetTrack, _ etiquette: String) async {
    let segments: [AVAssetTrackSegment]
    let echelle: CMTimeScale
    do {
        segments = try await piste.load(.segments)
        echelle = try await piste.load(.naturalTimeScale)
    } catch {
        print("      \(etiquette) : segments illisibles — \(error.localizedDescription)")
        return
    }
    print("      \(etiquette) : \(segments.count) segment(s), échelle de temps \(echelle)")
    for (i, s) in segments.enumerated() {
        let m = s.timeMapping
        let src = m.source, cib = m.target
        // Un timeMapping dont la source ne démarre pas à 0 est la marque d'une liste d'édition
        // appliquée : la présentation commence plus loin dans le média.
        let srcDebutS = CMTimeGetSeconds(src.start), cibDebutS = CMTimeGetSeconds(cib.start)
        let decalage = srcDebutS - cibDebutS
        print("        [\(i)] source \(src.start.value)/\(src.start.timescale)"
            + " (\(fmt(srcDebutS, 5)) s) durée \(fmt(CMTimeGetSeconds(src.duration), 5)) s"
            + "  ->  présentation \(fmt(cibDebutS, 5)) s"
            + " durée \(fmt(CMTimeGetSeconds(cib.duration), 5)) s"
            + "   décalage source-présentation \(fmt(decalage * 1000, 2)) ms"
            + (s.isEmpty ? "   [segment VIDE]" : ""))
    }
    if segments.isEmpty {
        print("        aucun segment : AVFoundation ne rapporte pas d'édition sur cette piste")
    }
}

func lireAudio(_ asset: AVAsset, _ piste: AVAssetTrack) throws -> (pcm: [Float], se: Double, premier: Double) {
    let lecteur = try AVAssetReader(asset: asset)
    let reglages: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVLinearPCMBitDepthKey: 32,
        AVLinearPCMIsFloatKey: true,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
    ]
    let sortie = AVAssetReaderTrackOutput(track: piste, outputSettings: reglages)
    sortie.alwaysCopiesSampleData = false
    lecteur.add(sortie)
    lecteur.startReading()
    var pcm = [Float]()
    var se: Double = 0
    var premier = Double.nan
    var canaux = 1
    while let tampon = sortie.copyNextSampleBuffer() {
        if premier.isNaN {
            premier = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(tampon))
        }
        if se == 0, let fd = CMSampleBufferGetFormatDescription(tampon),
           let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd) {
            se = asbd.pointee.mSampleRate
            canaux = Int(asbd.pointee.mChannelsPerFrame)
        }
        guard let bloc = CMSampleBufferGetDataBuffer(tampon) else { continue }
        let n = CMBlockBufferGetDataLength(bloc)
        var octets = [UInt8](repeating: 0, count: n)
        CMBlockBufferCopyDataBytes(bloc, atOffset: 0, dataLength: n, destination: &octets)
        octets.withUnsafeBytes { brut in
            let flottants = brut.bindMemory(to: Float.self)
            // Mono attendu ; si plusieurs canaux, on ne garde que le premier.
            if canaux == 1 { pcm.append(contentsOf: flottants) }
            else { for i in stride(from: 0, to: flottants.count, by: canaux) { pcm.append(flottants[i]) } }
        }
    }
    if lecteur.status == .failed {
        throw lecteur.error ?? NSError(domain: "lecture", code: -1)
    }
    return (pcm, se, premier.isNaN ? 0 : premier)
}

let fichiers = Array(CommandLine.arguments.dropFirst())
if fichiers.isEmpty {
    FileHandle.standardError.write("usage: swift mesure-avfoundation.swift <fichier.mp4> …\n".data(using: .utf8)!)
    exit(2)
}

print("MESURE PAR AVFOUNDATION — pile média d'Apple, sur la timeline ÉDITÉE")
print("  Portée : AVAssetReader n'est PAS un lecteur. Rien ici ne démontre le comportement de")
print("  QuickTime Player, du <video> de Safari ni de celui de Chrome.")
print("  Détection identique à outils/attaque.cjs : seuil à 25 % du pic local, premier dépassement.")
print("")

var rouges = 0
for chemin in fichiers {
    let nom = (chemin as NSString).lastPathComponent
    print("  \(nom)")
    let asset = AVURLAsset(url: URL(fileURLWithPath: chemin))
    do {
        let audio = try await asset.loadTracks(withMediaType: .audio)
        let video = try await asset.loadTracks(withMediaType: .video)
        print("    (a) segments")
        if let a = audio.first { await decrireSegments(a, "audio") } else { print("      audio : aucune piste") }
        if let v = video.first { await decrireSegments(v, "vidéo") } else { print("      vidéo : aucune piste") }

        guard let pisteAudio = audio.first else { print("    (b) pas de piste audio"); rouges += 1; continue }
        let (pcm, se, premier) = try lireAudio(asset, pisteAudio)
        print("    (b) attaque du bip — \(pcm.count) échantillons rendus à \(Int(se)) Hz,"
            + " premier horodatage \(fmt(premier * 1000, 2)) ms")
        var ecarts = [Double]()
        for inst in INSTANTS {
            if let t = attaque(pcm, se, inst) {
                let e = (t - inst) * 1000
                ecarts.append(e)
                print("        bip prévu à \(fmt(inst, 3)) s  ->  attaque \(fmt(t, 5)) s"
                    + "   écart \(e >= 0 ? "+" : "")\(fmt(e, 1)) ms")
            } else {
                print("        bip prévu à \(fmt(inst, 3)) s  ->  INTROUVABLE")
                rouges += 1
            }
        }
        if !ecarts.isEmpty {
            let moy = ecarts.reduce(0, +) / Double(ecarts.count)
            print("        écart moyen \(moy >= 0 ? "+" : "")\(fmt(moy, 1)) ms")
        }
    } catch {
        print("    ERREUR : \(error.localizedDescription)")
        rouges += 1
    }
    print("")
}
print("  " + (rouges > 0 ? "\(rouges) ROUGE(S)" : "verts : \(fichiers.count)   rouges : 0"))
exit(rouges > 0 ? 1 : 0)
