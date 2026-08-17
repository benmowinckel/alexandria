#!/usr/bin/env python3
"""SSRF and size-limit regressions for capture_resolver.py."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "factory/scripts/capture_resolver.py"


def load_resolver():
    spec = importlib.util.spec_from_file_location("capture_resolver", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


R = load_resolver()


class BlockedAddressTests(unittest.TestCase):
    def test_loopback_and_private(self):
        for ip in (
            "127.0.0.1",
            "0.0.0.0",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.10",
            "169.254.169.254",
            "100.64.0.1",
            "224.0.0.1",
            "255.255.255.255",
            "192.0.2.1",
            "::1",
            "fe80::1",
            "fc00::1",
            "ff02::1",
            "::ffff:127.0.0.1",
        ):
            self.assertTrue(R.is_blocked_ip(ip), ip)

    def test_public_address_allowed(self):
        self.assertFalse(R.is_blocked_ip("1.1.1.1"))
        self.assertFalse(R.is_blocked_ip("8.8.8.8"))


class UrlValidationTests(unittest.TestCase):
    def test_unsafe_schemes(self):
        for url in (
            "file:///etc/passwd",
            "gopher://example.com/",
            "http://example.com/",
            "ftp://example.com/",
            "javascript:alert(1)",
        ):
            with self.assertRaises(R.UnsafeURL):
                R.validate_url(url, resolver=lambda host: ["1.1.1.1"])

    def test_blocked_hosts(self):
        for url in (
            "https://localhost/secret",
            "https://metadata.google.internal/",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/",
            "https://127.0.0.1/",
        ):
            with self.assertRaises(R.UnsafeURL):
                R.validate_url(url, resolver=lambda host: ["1.1.1.1"])

    def test_dns_to_private_is_blocked(self):
        with self.assertRaises(R.UnsafeURL):
            R.validate_url(
                "https://evil.example/",
                resolver=lambda host: ["127.0.0.1"],
            )

    def test_ipv6_dns_to_ula_is_blocked(self):
        with self.assertRaises(R.UnsafeURL):
            R.validate_url(
                "https://evil.example/",
                resolver=lambda host: ["fd00::1"],
            )

    def test_fxtwitter_media_hosts(self):
        self.assertTrue(R.media_url_allowed("https://pbs.twimg.com/media/abc.jpg"))
        self.assertFalse(R.media_url_allowed("https://evil.example/media.jpg"))
        self.assertFalse(R.media_url_allowed("https://api.fxtwitter.com/media.jpg"))
        self.assertFalse(R.media_url_allowed("http://pbs.twimg.com/media/abc.jpg"))

    def test_tweet_id_url(self):
        self.assertEqual(
            R.fxtwitter_status_url("1234567890123456789"),
            "https://api.fxtwitter.com/i/status/1234567890123456789",
        )
        with self.assertRaises(R.UnsafeURL):
            R.fxtwitter_status_url("../secret")
        with self.assertRaises(R.UnsafeURL):
            R.fxtwitter_status_url("12")


class FetchGuardTests(unittest.TestCase):
    def test_redirect_to_loopback_is_blocked(self):
        class FakeConn:
            def __init__(self, *args, **kwargs):
                self.status_cycle = [302]
                self.sock = mock.Mock()

            def connect(self):
                return None

            def request(self, *args, **kwargs):
                return None

            def getresponse(self):
                class Resp:
                    status = 302

                    def getheader(self, name):
                        return "https://127.0.0.1/secret"

                    def read(self, n):
                        return b""

                return Resp()

            def close(self):
                return None

        with mock.patch.object(R, "_PinnedHTTPSConnection", FakeConn):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://public.example/start",
                    resolver=lambda host: ["1.1.1.1"] if host == "public.example" else ["127.0.0.1"],
                )

    def test_oversize_response_is_blocked(self):
        class FakeConn:
            def connect(self):
                return None

            def request(self, *args, **kwargs):
                return None

            def getresponse(self):
                class Resp:
                    status = 200

                    def getheader(self, name):
                        return None

                    def read(self, n):
                        return b"x" * (n if n < 100000 else 65536)

                return Resp()

            def close(self):
                return None

            sock = mock.Mock()

        with mock.patch.object(R, "_PinnedHTTPSConnection", lambda *a, **k: FakeConn()):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://public.example/big",
                    max_bytes=64,
                    resolver=lambda host: ["1.1.1.1"],
                )


if __name__ == "__main__":
    unittest.main()
