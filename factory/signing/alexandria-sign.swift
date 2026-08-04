import CryptoKit
import Foundation
import LocalAuthentication
import Security

private let identity = "alexandria-payload-signing"
private let factoryNamespace = "alexandria"
private let keyAlgorithm = "ecdsa-sha2-nistp256"
private let curve = "nistp256"
private let hashAlgorithm = "sha512"

private enum SignerError: LocalizedError {
    case usage
    case secureEnclaveUnavailable
    case accessControl(String)
    case badKeyReference
    case publicKeyMismatch
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .usage:
            return "usage: alexandria-sign init <key-reference> <public-key> | sign <key-reference> <manifest> <signature> | self-test <manifest> <public-key> <signature> | -Y sign -n git -f <public-key> <content>"
        case .secureEnclaveUnavailable:
            return "this Mac has no available Secure Enclave"
        case .accessControl(let message):
            return "could not create Touch ID access control: \(message)"
        case .badKeyReference:
            return "the Secure Enclave key reference is invalid or no longer usable"
        case .publicKeyMismatch:
            return "the requested public key is not this Mac's Alexandria Secure Enclave key"
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

private func bytesToSign(_ content: Data, namespace: String) -> Data {
    let digest = Data(SHA512.hash(data: content))
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

private func sshSignature(publicKey: Data, rawSignature: Data, namespace: String) -> Data {
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

private func sign(
    keyReferencePath: String,
    contentPath: String,
    signaturePath: String,
    namespace: String,
    purpose: String
) throws {
    guard SecureEnclave.isAvailable else { throw SignerError.secureEnclaveUnavailable }
    let keyReference = try Data(contentsOf: URL(fileURLWithPath: keyReferencePath))
    let content = try Data(contentsOf: URL(fileURLWithPath: contentPath))
    let contentHash = SHA256.hash(data: content).prefix(6).map { String(format: "%02x", $0) }.joined()

    let context = LAContext()
    context.touchIDAuthenticationAllowableReuseDuration = 0
    context.localizedReason = "\(purpose) \(contentHash)"

    let key: SecureEnclave.P256.Signing.PrivateKey
    do {
        key = try SecureEnclave.P256.Signing.PrivateKey(
            dataRepresentation: keyReference,
            authenticationContext: context
        )
    } catch {
        throw SignerError.badKeyReference
    }

    fputs("Touch ID: \(purpose) \(contentHash)\n", stderr)
    let signature = try key.signature(for: bytesToSign(content, namespace: namespace))
    let output = armored(sshSignature(
        publicKey: key.publicKey.x963Representation,
        rawSignature: signature.rawRepresentation,
        namespace: namespace
    ))
    try writePublic(output, to: signaturePath)
}

private func signGit(arguments: [String]) throws {
    guard arguments.count == 8,
          arguments[1] == "-Y",
          arguments[2] == "sign",
          arguments[3] == "-n",
          arguments[4] == "git",
          arguments[5] == "-f" else {
        throw SignerError.usage
    }

    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let environment = ProcessInfo.processInfo.environment
    let keyReferencePath = environment["ALEX_SIGNING_KEY_REFERENCE"]
        ?? "\(home)/.alexandria-signing/secure-enclave.keyref"
    let canonicalPublicKeyPath = environment["ALEX_SIGNING_PUBLIC_KEY"]
        ?? "\(home)/.alexandria-signing/secure-enclave.pub"
    let requestedPublicKey = try Data(contentsOf: URL(fileURLWithPath: arguments[6]))
    let canonicalPublicKey = try Data(contentsOf: URL(fileURLWithPath: canonicalPublicKeyPath))
    guard requestedPublicKey == canonicalPublicKey else { throw SignerError.publicKeyMismatch }

    try sign(
        keyReferencePath: keyReferencePath,
        contentPath: arguments[7],
        signaturePath: "\(arguments[7]).sig",
        namespace: "git",
        purpose: "Sign Alexandria commit"
    )
}

private func runSSHKeygen(arguments: [String]) -> Never {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/ssh-keygen")
    process.arguments = Array(arguments.dropFirst())
    process.standardInput = FileHandle.standardInput
    process.standardOutput = FileHandle.standardOutput
    process.standardError = FileHandle.standardError
    do {
        try process.run()
        process.waitUntilExit()
        exit(process.terminationStatus)
    } catch {
        fputs("alexandria-sign: could not run /usr/bin/ssh-keygen\n", stderr)
        exit(1)
    }
}

private func selfTest(manifestPath: String, publicKeyPath: String, signaturePath: String) throws {
    let manifest = try Data(contentsOf: URL(fileURLWithPath: manifestPath))
    let key = P256.Signing.PrivateKey()
    let signature = try key.signature(for: bytesToSign(manifest, namespace: factoryNamespace))
    try writePublic(Data(allowedSignerLine(key.publicKey.x963Representation).utf8), to: publicKeyPath)
    try writePublic(armored(sshSignature(
        publicKey: key.publicKey.x963Representation,
        rawSignature: signature.rawRepresentation,
        namespace: factoryNamespace
    )), to: signaturePath)
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 2 else { throw SignerError.usage }
    if arguments.count >= 3, arguments[1] == "-Y" {
        if arguments[2] == "sign" {
            try signGit(arguments: arguments)
            exit(0)
        }
        runSSHKeygen(arguments: arguments)
    }
    switch arguments[1] {
    case "init":
        guard arguments.count == 4 else { throw SignerError.usage }
        try initialize(keyReferencePath: arguments[2], publicKeyPath: arguments[3])
    case "sign":
        guard arguments.count == 5 else { throw SignerError.usage }
        try sign(
            keyReferencePath: arguments[2],
            contentPath: arguments[3],
            signaturePath: arguments[4],
            namespace: factoryNamespace,
            purpose: "Ship Alexandria release"
        )
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
