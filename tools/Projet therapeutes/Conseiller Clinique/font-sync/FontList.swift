import Foundation
import CoreText

// CoreText lists the faces macOS currently exposes to applications. Keep the exact
// family name for CSS and a readable label for the picker (Pompiere has a trailing
// space in its font file), without exposing font files or their contents.
let collection = CTFontCollectionCreateFromAvailableFonts(nil)
let descriptors = CTFontCollectionCreateMatchingFontDescriptors(collection) as? [CTFontDescriptor] ?? []
var families: [String: [String: Any]] = [:]
for descriptor in descriptors {
    let exact = CTFontDescriptorCopyAttribute(descriptor, kCTFontFamilyNameAttribute) as? String ?? ""
    let postscript = CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String ?? ""
    let label = exact.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !label.isEmpty, !label.hasPrefix("."), !postscript.isEmpty else { continue }
    if families[label] == nil {
        families[label] = ["label": label, "family": exact, "postscriptName": postscript]
    }
}
let sorted = families.values.sorted {
    ($0["label"] as? String ?? "").localizedCaseInsensitiveCompare($1["label"] as? String ?? "") == .orderedAscending
}
let data = try JSONSerialization.data(withJSONObject: sorted, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
