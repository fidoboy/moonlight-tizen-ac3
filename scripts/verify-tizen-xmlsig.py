#!/usr/bin/env python3
"""Strict verifier for Tizen package XML Digital Signatures.

The verifier intentionally supports only the algorithms and reference forms
observed in Tizen-generated hybrid WGTs. Unknown transforms or URI forms fail
closed rather than weakening signature validation.
"""

import base64
import hashlib
import hmac
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath
from urllib.parse import unquote_to_bytes, urlsplit

DS = "{http://www.w3.org/2000/09/xmldsig#}"
RSA_SHA512 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"
EXCLUSIVE_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#"
C14N11 = "http://www.w3.org/2006/12/xml-c14n11"
SHA512 = "http://www.w3.org/2001/04/xmlenc#sha512"

SIGNED_INFO_XPATH = (
    "/*[local-name()='Signature']/*[local-name()='SignedInfo']"
    "/descendant-or-self::node() | "
    "/*[local-name()='Signature']/*[local-name()='SignedInfo']"
    "/descendant-or-self::*/@* | "
    "/*[local-name()='Signature']/*[local-name()='SignedInfo']"
    "/descendant-or-self::*/namespace::*"
)
PROP_XPATH = (
    "//*[@Id='prop']/descendant-or-self::node() | "
    "//*[@Id='prop']/descendant-or-self::*/@* | "
    "//*[@Id='prop']/descendant-or-self::*/namespace::*"
)

def fail(message):
    raise SystemExit(message)


def canonicalize(helper, signature_path, xpath, mode):
    return subprocess.run(
        [str(helper), str(signature_path), xpath, mode],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout


def decode_reference_path(uri, package_root):
    if not uri or re.search(r"%(?![0-9A-Fa-f]{2})", uri):
        fail(f"invalid external reference URI: {uri!r}")
    parsed = urlsplit(uri)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or uri.startswith("/"):
        fail(f"external reference is not a safe relative package URI: {uri!r}")
    try:
        decoded = unquote_to_bytes(uri).decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        fail(f"external reference is not valid UTF-8 ({uri!r}): {exc}")
    if (
        not decoded
        or "\\" in decoded
        or "\x00" in decoded
        or any(ord(ch) < 0x20 or ord(ch) == 0x7f for ch in decoded)
        or re.search(r"%[0-9A-Fa-f]{2}", decoded)
    ):
        fail(f"external reference contains unsafe or double-encoded characters: {uri!r}")
    relative = PurePosixPath(decoded)
    if relative.is_absolute() or ".." in relative.parts:
        fail(f"external reference escapes the package: {uri!r}")
    target = (package_root / Path(*relative.parts)).resolve()
    try:
        target.relative_to(package_root.resolve())
    except ValueError:
        fail(f"external reference resolves outside the package: {uri!r}")
    if not target.is_file():
        fail(f"signature references missing package file: {uri!r} (decoded as {decoded!r})")
    return target


def verify_one(package_root, filename, expected_certificate, helper):
    signature_path = package_root / filename
    try:
        signature = ET.parse(signature_path).getroot()
    except (ET.ParseError, OSError) as exc:
        fail(f"cannot parse {filename}: {exc}")
    if signature.tag != DS + "Signature":
        fail(f"{filename} root is not an XMLDSig Signature")

    signed_info_nodes = signature.findall(DS + "SignedInfo")
    signature_values = signature.findall(DS + "SignatureValue")
    if len(signed_info_nodes) != 1 or len(signature_values) != 1:
        fail(f"{filename} must contain exactly one SignedInfo and SignatureValue")
    signed_info = signed_info_nodes[0]

    canonicalization = signed_info.find(DS + "CanonicalizationMethod")
    signature_method = signed_info.find(DS + "SignatureMethod")
    if canonicalization is None or canonicalization.get("Algorithm") != EXCLUSIVE_C14N:
        fail(f"{filename} uses an unsupported SignedInfo canonicalization method")
    if signature_method is None or signature_method.get("Algorithm") != RSA_SHA512:
        fail(f"{filename} uses an unsupported signature method")

    key_info = signature.find(DS + "KeyInfo")
    certificates = [] if key_info is None else key_info.findall(".//" + DS + "X509Certificate")
    if not certificates or not (certificates[0].text or "").strip():
        fail(f"{filename} has no embedded signing certificate")
    try:
        embedded_der = base64.b64decode("".join(certificates[0].text.split()), validate=True)
    except ValueError as exc:
        fail(f"{filename} contains an invalid embedded certificate: {exc}")

    embedded_der_path = package_root / (filename + ".embedded.der")
    expected_der_path = package_root / (filename + ".expected.der")
    embedded_der_path.write_bytes(embedded_der)
    subprocess.run(
        ["openssl", "x509", "-in", str(expected_certificate), "-outform", "DER",
         "-out", str(expected_der_path)],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if not hmac.compare_digest(embedded_der, expected_der_path.read_bytes()):
        fail(f"{filename} embedded signer certificate does not match the configured certificate")

    public_key = package_root / (filename + ".pub.pem")
    subprocess.run(
        ["openssl", "x509", "-in", str(expected_certificate), "-pubkey", "-noout",
         "-out", str(public_key)],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    references = signed_info.findall(DS + "Reference")
    if not references:
        fail(f"{filename} contains no signed references")
    external_count = 0
    fragment_count = 0
    for index, reference in enumerate(references, 1):
        uri = reference.get("URI", "")
        digest_method = reference.find(DS + "DigestMethod")
        digest_value = reference.find(DS + "DigestValue")
        if digest_method is None or digest_method.get("Algorithm") != SHA512:
            fail(f"{filename} reference {index} uses an unsupported digest method: {uri!r}")
        if digest_value is None or not (digest_value.text or "").strip():
            fail(f"{filename} reference {index} has no DigestValue: {uri!r}")
        try:
            expected_digest = base64.b64decode("".join(digest_value.text.split()), validate=True)
        except ValueError as exc:
            fail(f"{filename} reference {index} has invalid base64 digest: {exc}")
        if len(expected_digest) != hashlib.sha512().digest_size:
            fail(f"{filename} reference {index} has a non-SHA512 digest length")

        transforms_node = reference.find(DS + "Transforms")
        transforms = [] if transforms_node is None else transforms_node.findall(DS + "Transform")
        if uri.startswith("#"):
            fragment_count += 1
            if uri != "#prop" or len(transforms) != 1 or transforms[0].get("Algorithm") != C14N11:
                fail(f"{filename} has an unsupported same-document reference: {uri!r}")
            matches = [node for node in signature.iter() if node.get("Id") == "prop"]
            if len(matches) != 1:
                fail(f"{filename} #prop reference does not resolve to exactly one element")
            canonical = canonicalize(helper, signature_path, PROP_XPATH, "c14n11")
            actual_digest = hashlib.sha512(canonical).digest()
        else:
            external_count += 1
            if transforms:
                fail(f"{filename} external reference has unsupported transforms: {uri!r}")
            target = decode_reference_path(uri, package_root)
            actual_digest = hashlib.sha512(target.read_bytes()).digest()

        if not hmac.compare_digest(actual_digest, expected_digest):
            fail(f"{filename} reference digest mismatch: {uri!r}")

    if fragment_count != 1:
        fail(f"{filename} must contain exactly one #prop reference; found {fragment_count}")

    try:
        signature_bytes = base64.b64decode(
            "".join((signature_values[0].text or "").split()), validate=True
        )
    except ValueError as exc:
        fail(f"{filename} contains an invalid SignatureValue: {exc}")
    signature_file = package_root / (filename + ".signature.bin")
    canonical_file = package_root / (filename + ".signed-info.c14n")
    signature_file.write_bytes(signature_bytes)
    canonical_file.write_bytes(
        canonicalize(helper, signature_path, SIGNED_INFO_XPATH, "exclusive")
    )
    subprocess.run(
        ["openssl", "dgst", "-sha512", "-verify", str(public_key),
         "-signature", str(signature_file), str(canonical_file)],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    print(
        f"Verified {filename}: RSA-SHA512 signature, pinned signer certificate, "
        f"{len(references)} SHA-512 references ({external_count} package files, #prop C14N 1.1)."
    )


def main():
    if len(sys.argv) != 5:
        fail("usage: verify-tizen-xmlsig.py <extracted-wgt-dir> <author-cert.pem> <distributor-cert.pem> <xml-c14n-helper>")
    package_root = Path(sys.argv[1]).resolve()
    helper = Path(sys.argv[4]).resolve()
    if not package_root.is_dir():
        fail(f"package extraction directory does not exist: {package_root}")
    if not helper.is_file():
        fail(f"XML canonicalization helper does not exist: {helper}")
    verify_one(package_root, "author-signature.xml", Path(sys.argv[2]).resolve(), helper)
    verify_one(package_root, "signature1.xml", Path(sys.argv[3]).resolve(), helper)


if __name__ == "__main__":
    main()
