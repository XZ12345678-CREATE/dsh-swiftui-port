import SwiftUI
struct Counter: View {
    @State private var value = 0
    var body: some View { Button("Count: \(value)") { value += 1 } }
}
