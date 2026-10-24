import Foundation
import CoreText

// CoreText lists the faces macOS currently exposes to applications. Keep the exact
// family name for CSS and a readable label for the picker (Pompiere has a trailing
// space in its font file). The local HTTPS bridge resolves file paths to opaque IDs;
// paths are never included in its browser response.
let collection = CTFontCollectionCreateFromAvailableFonts(nil)
let descriptors = CTFontCollectionCreateMatchingFontDescriptors(collection) as? [CTFontDescriptor] ?? []
var families: [String: [String: Any]] = [:]
for descriptor in descriptors {
    let exact = CTFontDescriptorCopyAttribute(descriptor, kCTFontFamilyNameAttribute) as? String ?? ""
    let postscript = CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String ?? ""
    let fileURL = CTFontDescriptorCopyAttribute(descriptor, kCTFontURLAttribute) as? URL
    let style = CTFontDescriptorCopyAttribute(descriptor, kCTFontStyleNameAttribute) as? String ?? ""
    let label = exact.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !label.isEmpty, !label.hasPrefix("."), !postscript.isEmpty else { continue }
    let candidate: [String: Any] = ["label": label, "family": exact,
                                    "postscriptName": postscript,
                                    "filePath": fileURL?.path ?? "", "style": style]
    if families[label] == nil || (style.lowercased() == "regular" &&
                                  (families[label]?["style"] as? String)?.lowercased() != "regular") {
        families[label] = candidate
    }
}
let sorted = families.values.sorted {
    ($0["label"] as? String ?? "").localizedCaseInsensitiveCompare($1["label"] as? String ?? "") == .orderedAscending
}
let data = try JSONSerialization.data(withJSONObject: sorted, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
