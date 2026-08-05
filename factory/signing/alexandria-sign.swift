import CryptoKit
import Darwin
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
    case agent(String)
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .usage:
            return "usage: alexandria-sign init <key-reference> <public-key> | init-auth <key-reference> <public-key> | sign <key-reference> <manifest> <signature> | agent <key-reference> <socket> | self-test <manifest> <public-key> <signature> | -Y sign -n git -f <public-key> <content>"
        case .secureEnclaveUnavailable:
            return "this Mac has no available Secure Enclave"
        case .accessControl(let message):
            return "could not create Touch ID access control: \(message)"
        case .badKeyReference:
            return "the Secure Enclave key reference is invalid or no longer usable"
        case .publicKeyMismatch:
            return "the requested public key is not this Mac's Alexandria Secure Enclave key"
        case .agent(let message):
            return "SSH agent error: \(message)"
        case .writeFailed(let path):
            return "could not write \(path)"
        }
    }
}

private struct SSHReader {
    private let bytes: [UInt8]
    private var offset = 0

    init(_ data: Data) {
        bytes = Array(data)
    }

    mutating func byte() throws -> UInt8 {
        guard offset < bytes.count else { throw SignerError.agent("truncated request") }
        defer { offset += 1 }
        return bytes[offset]
    }

    mutating func uint32() throws -> UInt32 {
        guard offset + 4 <= bytes.count else { throw SignerError.agent("truncated request") }
        let value = bytes[offset..<offset + 4].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        offset += 4
        return value
    }

    mutating func string() throws -> Data {
        let length = Int(try uint32())
        guard length >= 0, offset + length <= bytes.count else {
            throw SignerError.agent("invalid SSH string")
        }
        let value = Data(bytes[offset..<offset + length])
        offset += length
        return value
    }

    var isAtEnd: Bool { offset == bytes.count }
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

private func authorizedKeyLine(_ x963: Data) -> String {
    let encoded = publicKeyBlob(x963).base64EncodedString()
    return "\(keyAlgorithm) \(encoded) alexandria-touchid-release\n"
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

private func readExact(_ count: Int, from descriptor: Int32, allowEOF: Bool = false) throws -> Data? {
    var bytes = [UInt8](repeating: 0, count: count)
    var offset = 0
    while offset < count {
        let readCount = bytes.withUnsafeMutableBytes { buffer in
            Darwin.read(descriptor, buffer.baseAddress!.advanced(by: offset), count - offset)
        }
        if readCount == 0 {
            if allowEOF && offset == 0 { return nil }
            throw SignerError.agent("connection closed mid-packet")
        }
        if readCount < 0 {
            if errno == EINTR { continue }
            throw SignerError.agent(String(cString: strerror(errno)))
        }
        offset += readCount
    }
    return Data(bytes)
}

private func writeAll(_ data: Data, to descriptor: Int32) throws {
    var offset = 0
    try data.withUnsafeBytes { buffer in
        while offset < data.count {
            let written = Darwin.write(descriptor, buffer.baseAddress!.advanced(by: offset), data.count - offset)
            if written < 0 {
                if errno == EINTR { continue }
                throw SignerError.agent(String(cString: strerror(errno)))
            }
            if written == 0 { throw SignerError.agent("connection stopped accepting data") }
            offset += written
        }
    }
}

private func readPacket(from descriptor: Int32) throws -> Data? {
    guard let header = try readExact(4, from: descriptor, allowEOF: true) else { return nil }
    var reader = SSHReader(header)
    let length = Int(try reader.uint32())
    guard length > 0, length <= 256 * 1024 else {
        throw SignerError.agent("invalid packet length")
    }
    return try readExact(length, from: descriptor)
}

private func writePacket(_ payload: Data, to descriptor: Int32) throws {
    var packet = Data()
    packet.appendUInt32(UInt32(payload.count))
    packet.append(payload)
    try writeAll(packet, to: descriptor)
}

private func loadSecureKey(reference: Data, context: LAContext) throws -> SecureEnclave.P256.Signing.PrivateKey {
    do {
        return try SecureEnclave.P256.Signing.PrivateKey(
            dataRepresentation: reference,
            authenticationContext: context
        )
    } catch {
        throw SignerError.badKeyReference
    }
}

private func agentResponse(
    request: Data,
    keyReference: Data,
    expectedPublicKey: Data,
    purpose: String
) throws -> Data {
    var reader = SSHReader(request)
    switch try reader.byte() {
    case 11: // SSH2_AGENTC_REQUEST_IDENTITIES
        guard reader.isAtEnd else { throw SignerError.agent("invalid identity request") }
        var response = Data([12]) // SSH2_AGENT_IDENTITIES_ANSWER
        response.appendUInt32(1)
        response.appendSSHString(expectedPublicKey)
        response.appendSSHString("alexandria-touchid")
        return response

    case 13: // SSH2_AGENTC_SIGN_REQUEST
        let requestedKey = try reader.string()
        let data = try reader.string()
        _ = try reader.uint32() // Flags apply to RSA only.
        guard reader.isAtEnd, requestedKey == expectedPublicKey else {
            throw SignerError.publicKeyMismatch
        }

        let contentHash = SHA256.hash(data: data).prefix(6).map { String(format: "%02x", $0) }.joined()
        let context = LAContext()
        context.touchIDAuthenticationAllowableReuseDuration = 0
        context.localizedReason = "\(purpose) \(contentHash)"
        let key = try loadSecureKey(reference: keyReference, context: context)

        fputs("Touch ID: \(purpose) \(contentHash)\n", stderr)
        let signature = try key.signature(for: data)
        var response = Data([14]) // SSH2_AGENT_SIGN_RESPONSE
        response.appendSSHString(signatureBlob(rawSignature: signature.rawRepresentation))
        return response

    default:
        return Data([5]) // SSH_AGENT_FAILURE
    }
}

private func runAgent(keyReferencePath: String, socketPath: String) throws -> Never {
    guard SecureEnclave.isAvailable else { throw SignerError.secureEnclaveUnavailable }
    let keyReference = try Data(contentsOf: URL(fileURLWithPath: keyReferencePath))
    let context = LAContext()
    context.localizedReason = "Prepare Alexandria release"
    let key = try loadSecureKey(reference: keyReference, context: context)
    let expectedPublicKey = publicKeyBlob(key.publicKey.x963Representation)
    let purpose = ProcessInfo.processInfo.environment["ALEX_SIGNING_PURPOSE"] ?? "Ship Alexandria release"

    signal(SIGPIPE, SIG_IGN)
    let server = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard server >= 0 else { throw SignerError.agent(String(cString: strerror(errno))) }
    defer { Darwin.close(server) }

    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let pathBytes = Array(socketPath.utf8CString)
    let pathCapacity = MemoryLayout.size(ofValue: address.sun_path)
    guard pathBytes.count <= pathCapacity else { throw SignerError.agent("socket path is too long") }
    withUnsafeMutableBytes(of: &address.sun_path) { destination in
        pathBytes.withUnsafeBytes { source in
            destination.copyBytes(from: source)
        }
    }
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)

    let bound = withUnsafePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            Darwin.bind(server, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
        }
    }
    guard bound == 0 else { throw SignerError.agent(String(cString: strerror(errno))) }
    guard chmod(socketPath, S_IRUSR | S_IWUSR) == 0 else {
        throw SignerError.agent(String(cString: strerror(errno)))
    }
    guard Darwin.listen(server, 4) == 0 else {
        throw SignerError.agent(String(cString: strerror(errno)))
    }

    fputs("Touch ID SSH agent ready: \(socketPath)\n", stderr)
    while true {
        let client = Darwin.accept(server, nil, nil)
        if client < 0 {
            if errno == EINTR { continue }
            throw SignerError.agent(String(cString: strerror(errno)))
        }
        do {
            while let request = try readPacket(from: client) {
                let response = try agentResponse(
                    request: request,
                    keyReference: keyReference,
                    expectedPublicKey: expectedPublicKey,
                    purpose: purpose
                )
                try writePacket(response, to: client)
            }
        } catch {
            try? writePacket(Data([5]), to: client)
        }
        Darwin.close(client)
    }
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

private func initialize(keyReferencePath: String, publicKeyPath: String, authorizedKey: Bool = false) throws {
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
    let publicKey = authorizedKey
        ? authorizedKeyLine(key.publicKey.x963Representation)
        : allowedSignerLine(key.publicKey.x963Representation)
    try writePublic(Data(publicKey.utf8), to: publicKeyPath)
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
    case "init-auth":
        guard arguments.count == 4 else { throw SignerError.usage }
        try initialize(keyReferencePath: arguments[2], publicKeyPath: arguments[3], authorizedKey: true)
    case "sign":
        guard arguments.count == 5 else { throw SignerError.usage }
        try sign(
            keyReferencePath: arguments[2],
            contentPath: arguments[3],
            signaturePath: arguments[4],
            namespace: factoryNamespace,
            purpose: "Ship Alexandria release"
        )
    case "agent":
        guard arguments.count == 4 else { throw SignerError.usage }
        try runAgent(keyReferencePath: arguments[2], socketPath: arguments[3])
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
