import CryptoKit
import Foundation
import LocalAuthentication
import Security

private let identity = "alexandria-payload-signing"
private let namespace = "alexandria"
private let keyAlgorithm = "ecdsa-sha2-nistp256"
private let curve = "nistp256"
private let hashAlgorithm = "sha512"

private enum SignerError: LocalizedError {
    case usage
    case secureEnclaveUnavailable
    case accessControl(String)
    case badKeyReference
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .usage:
            return "usage: alexandria-sign init <key-reference> <public-key> | sign <key-reference> <manifest> <signature> | self-test <manifest> <public-key> <signature>"
        case .secureEnclaveUnavailable:
            return "this Mac has no available Secure Enclave"
        case .accessControl(let message):
            return "could not create Touch ID access control: \(message)"
        case .badKeyReference:
            return "the Secure Enclave key reference is invalid or no longer usable"
        case .writeFailed(let path):
            return "could not write \(path)"
        }
    }
}

private extension Data {
    mutating func appendUInt32(_ value: UInt32) {
        var bigEndian = value.bigEndian
        Swift.withUnsafeBytes(of: &bigEndian) { append(contentsOf: $0) }
    }

    mutating func appendSSHString(_ data: Data) {
        appendUInt32(UInt32(data.count))
        append(data)
    }

    mutating func appendSSHString(_ string: String) {
        appendSSHString(Data(string.utf8))
    }
}

private func mpint(_ bytes: Data) -> Data {
    var value = Array(bytes.drop { $0 == 0 })
    if value.isEmpty { return Data() }
    if value[0] & 0x80 != 0 { value.insert(0, at: 0) }
    return Data(value)
}

private func publicKeyBlob(_ x963: Data) -> Data {
    var blob = Data()
    blob.appendSSHString(keyAlgorithm)
    blob.appendSSHString(curve)
    blob.appendSSHString(x963)
    return blob
}

private func allowedSignerLine(_ x963: Data) -> String {
    let encoded = publicKeyBlob(x963).base64EncodedString()
    return "\(identity) \(keyAlgorithm) \(encoded) alexandria-touchid\n"
}

private func bytesToSign(_ manifest: Data) -> Data {
    let digest = Data(SHA512.hash(data: manifest))
    var payload = Data("SSHSIG".utf8)
    payload.appendSSHString(namespace)
    payload.appendSSHString(Data())
    payload.appendSSHString(hashAlgorithm)
    payload.appendSSHString(digest)
    return payload
}

private func signatureBlob(rawSignature: Data) -> Data {
    precondition(rawSignature.count == 64)
    let r = mpint(Data(rawSignature.prefix(32)))
    let s = mpint(Data(rawSignature.suffix(32)))

    var ecdsa = Data()
    ecdsa.appendSSHString(r)
    ecdsa.appendSSHString(s)

    var signature = Data()
    signature.appendSSHString(keyAlgorithm)
    signature.appendSSHString(ecdsa)
    return signature
}

private func sshSignature(publicKey: Data, rawSignature: Data) -> Data {
    var envelope = Data("SSHSIG".utf8)
    envelope.appendUInt32(1)
    envelope.appendSSHString(publicKeyBlob(publicKey))
    envelope.appendSSHString(namespace)
    envelope.appendSSHString(Data())
    envelope.appendSSHString(hashAlgorithm)
    envelope.appendSSHString(signatureBlob(rawSignature: rawSignature))
    return envelope
}

private func armored(_ signature: Data) -> Data {
    let base64 = signature.base64EncodedString()
    var lines: [String] = []
    var index = base64.startIndex
    while index < base64.endIndex {
        let end = base64.index(index, offsetBy: 70, limitedBy: base64.endIndex) ?? base64.endIndex
        lines.append(String(base64[index..<end]))
        index = end
    }
    let text = (["-----BEGIN SSH SIGNATURE-----"] + lines + ["-----END SSH SIGNATURE-----", ""]).joined(separator: "\n")
    return Data(text.utf8)
}

private func writePrivate(_ data: Data, to path: String) throws {
    let url = URL(fileURLWithPath: path)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard FileManager.default.createFile(atPath: path, contents: data, attributes: [.posixPermissions: 0o600]) else {
        throw SignerError.writeFailed(path)
    }
}

private func writePublic(_ data: Data, to path: String) throws {
    let url = URL(fileURLWithPath: path)
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: path)
}

private func initialize(keyReferencePath: String, publicKeyPath: String) throws {
    guard SecureEnclave.isAvailable else { throw SignerError.secureEnclaveUnavailable }
    guard !FileManager.default.fileExists(atPath: keyReferencePath) else {
        fputs("refusing to replace the existing Secure Enclave key\n", stderr)
        exit(2)
    }

    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        &error
    ) else {
        let message = error?.takeRetainedValue().localizedDescription ?? "unknown error"
        throw SignerError.accessControl(message)
    }

    let key = try SecureEnclave.P256.Signing.PrivateKey(accessControl: access)
    try writePrivate(key.dataRepresentation, to: keyReferencePath)
    try writePublic(Data(allowedSignerLine(key.publicKey.x963Representation).utf8), to: publicKeyPath)
    print("Touch ID signing key created inside this Mac")
}

private func sign(keyReferencePath: String, manifestPath: String, signaturePath: String) throws {
    guard SecureEnclave.isAvailable else { throw SignerError.secureEnclaveUnavailable }
    let keyReference = try Data(contentsOf: URL(fileURLWithPath: keyReferencePath))
    let manifest = try Data(contentsOf: URL(fileURLWithPath: manifestPath))
    let releaseHash = SHA256.hash(data: manifest).prefix(6).map { String(format: "%02x", $0) }.joined()

    let context = LAContext()
    context.touchIDAuthenticationAllowableReuseDuration = 0
    context.localizedReason = "Ship Alexandria release \(releaseHash)"

    let key: SecureEnclave.P256.Signing.PrivateKey
    do {
        key = try SecureEnclave.P256.Signing.PrivateKey(
            dataRepresentation: keyReference,
            authenticationContext: context
        )
    } catch {
        throw SignerError.badKeyReference
    }

    print("Touch ID will ship release \(releaseHash)")
    let signature = try key.signature(for: bytesToSign(manifest))
    let output = armored(sshSignature(
        publicKey: key.publicKey.x963Representation,
        rawSignature: signature.rawRepresentation
    ))
    try writePublic(output, to: signaturePath)
}

private func selfTest(manifestPath: String, publicKeyPath: String, signaturePath: String) throws {
    let manifest = try Data(contentsOf: URL(fileURLWithPath: manifestPath))
    let key = P256.Signing.PrivateKey()
    let signature = try key.signature(for: bytesToSign(manifest))
    try writePublic(Data(allowedSignerLine(key.publicKey.x963Representation).utf8), to: publicKeyPath)
    try writePublic(armored(sshSignature(
        publicKey: key.publicKey.x963Representation,
        rawSignature: signature.rawRepresentation
    )), to: signaturePath)
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 2 else { throw SignerError.usage }
    switch arguments[1] {
    case "init":
        guard arguments.count == 4 else { throw SignerError.usage }
        try initialize(keyReferencePath: arguments[2], publicKeyPath: arguments[3])
    case "sign":
        guard arguments.count == 5 else { throw SignerError.usage }
        try sign(keyReferencePath: arguments[2], manifestPath: arguments[3], signaturePath: arguments[4])
    case "self-test":
        guard arguments.count == 5 else { throw SignerError.usage }
        try selfTest(manifestPath: arguments[2], publicKeyPath: arguments[3], signaturePath: arguments[4])
    default:
        throw SignerError.usage
    }
} catch {
    fputs("alexandria-sign: \(error.localizedDescription)\n", stderr)
    exit(1)
}
