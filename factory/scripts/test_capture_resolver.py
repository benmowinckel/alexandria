#!/usr/bin/env python3
"""SSRF and size-limit regressions for capture_resolver.py."""

from __future__ import annotations

import importlib.util
import tempfile
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
            "168.63.129.16",
            "::1",
            "fe80::1",
            "fc00::1",
            "ff02::1",
            "::ffff:127.0.0.1",
            "::ffff:169.254.169.254",
            "::ffff:168.63.129.16",
            "64:ff9b::a9fe:a9fe",
            "2002:a9fe:a9fe::1",
            "2001:0:4136:e378:8000:63bf:3fff:fdd2",
        ):
            self.assertTrue(R.is_blocked_ip(ip), ip)

    def test_public_address_allowed(self):
        self.assertFalse(R.is_blocked_ip("1.1.1.1"))
        self.assertFalse(R.is_blocked_ip("8.8.8.8"))
        self.assertFalse(R.is_blocked_ip("::ffff:8.8.8.8"))


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
            "https://localhost./secret",
            "https://foo.localhost/secret",
            "https://foo.local/secret",
            "https://foo.internal/secret",
            "https://metadata.google.internal/",
            "https://metadata/",
            "https://169.254.169.254/latest/meta-data",
            "https://168.63.129.16/",
            "https://[::1]/",
            "https://127.0.0.1/",
            "https://user:pass@example.com/",
            "https://2130706433/",
            "https://127.1/",
            "https://0x7f000001/",
        ):
            with self.assertRaises(R.UnsafeURL):
                R.validate_url(url, resolver=lambda host: ["1.1.1.1"])

    def test_control_characters_are_blocked(self):
        with self.assertRaises(R.UnsafeURL):
            R.validate_url(
                "https://example.com/foo\r\nX: y",
                resolver=lambda host: ["1.1.1.1"],
            )

    def test_dns_to_private_is_blocked(self):
        with self.assertRaises(R.UnsafeURL):
            R.validate_url(
                "https://evil.example/",
                resolver=lambda host: ["127.0.0.1"],
            )

    def test_mixed_public_and_private_dns_is_blocked(self):
        with self.assertRaises(R.UnsafeURL):
            R.validate_url(
                "https://rebind.example/",
                resolver=lambda host: ["1.1.1.1", "169.254.169.254"],
            )

    def test_ipv6_dns_to_ula_is_blocked(self):
        with self.assertRaises(R.UnsafeURL):
            R.validate_url(
                "https://evil.example/",
                resolver=lambda host: ["fd00::1"],
            )

    def test_trailing_dot_allowlist(self):
        parsed, ips = R.validate_url(
            "https://api.fxtwitter.com./i/status/1",
            allowed_hosts=frozenset({R.FXTWITTER_HOST}),
            resolver=lambda host: ["1.1.1.1"],
        )
        self.assertEqual(R._normalized_host(parsed.hostname or ""), R.FXTWITTER_HOST)
        self.assertEqual(ips, ["1.1.1.1"])

    def test_fxtwitter_media_hosts(self):
        self.assertTrue(R.media_url_allowed("https://pbs.twimg.com/media/abc.jpg"))
        self.assertTrue(R.media_url_allowed("https://pbs.twimg.com./media/abc.jpg"))
        self.assertFalse(R.media_url_allowed("https://evil.example/media.jpg"))
        self.assertFalse(R.media_url_allowed("https://evil.pbs.twimg.com/media.jpg"))
        self.assertFalse(R.media_url_allowed("https://pbs.twimg.com.evil.example/media.jpg"))
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


class _RedirectConn:
    def __init__(self, location, status=302):
        self.location = location
        self.status_code = status
        self.sock = mock.Mock()

    def connect(self):
        return None

    def request(self, *args, **kwargs):
        return None

    def getresponse(self):
        location = self.location

        class Resp:
            status = 302

            def getheader(self, name):
                return location

            def read(self, n):
                return b""

        Resp.status = self.status_code
        return Resp()

    def close(self):
        return None


class FetchGuardTests(unittest.TestCase):
    def test_redirect_to_loopback_is_blocked(self):
        with mock.patch.object(R, "_PinnedHTTPSConnection", lambda *a, **k: _RedirectConn("https://127.0.0.1/secret")):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://public.example/start",
                    resolver=lambda host: ["1.1.1.1"] if host == "public.example" else ["127.0.0.1"],
                )

    def test_redirect_to_http_is_blocked(self):
        with mock.patch.object(R, "_PinnedHTTPSConnection", lambda *a, **k: _RedirectConn("http://public.example/next")):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://public.example/start",
                    resolver=lambda host: ["1.1.1.1"],
                )

    def test_redirect_with_userinfo_is_blocked(self):
        with mock.patch.object(
            R, "_PinnedHTTPSConnection", lambda *a, **k: _RedirectConn("https://evil@127.0.0.1/")
        ):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://public.example/start",
                    resolver=lambda host: ["1.1.1.1"],
                )

    def test_redirect_to_disallowed_media_host_is_blocked(self):
        with mock.patch.object(
            R, "_PinnedHTTPSConnection", lambda *a, **k: _RedirectConn("https://evil.example/photo.jpg")
        ):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://pbs.twimg.com/media/abc.jpg",
                    allowed_hosts=R.FXTWITTER_MEDIA_HOSTS,
                    resolver=lambda host: ["1.1.1.1"],
                )

    def test_too_many_redirects_is_blocked(self):
        with mock.patch.object(
            R, "_PinnedHTTPSConnection", lambda *a, **k: _RedirectConn("https://public.example/next")
        ):
            with self.assertRaises(R.UnsafeURL):
                R.safe_urlopen(
                    "https://public.example/start",
                    resolver=lambda host: ["1.1.1.1"],
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


class FolderBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.inbox = root / "input"
        self.out = root / "_input"
        self.inbox.mkdir()
        self.out.mkdir()
        self._old_in = R.INPUT
        self._old_out = R.OUTPUT
        R.INPUT = self.inbox
        R.OUTPUT = self.out

    def tearDown(self):
        R.INPUT = self._old_in
        R.OUTPUT = self._old_out
        self.temp.cleanup()

    def test_page_meta_reads_local_html_only(self):
        html = """
        <html><head>
        <title>Saved page</title>
        <link rel="canonical" href="https://www.instagram.com/p/abc/">
        <meta property="og:title" content="See this">
        <meta property="og:description" content="A caption">
        </head></html>
        """
        meta = R.page_meta(html)
        self.assertEqual(meta["title"], "Saved page")
        self.assertEqual(meta["url"], "https://www.instagram.com/p/abc/")
        self.assertEqual(meta["og_title"], "See this")
        self.assertEqual(meta["og_desc"], "A caption")

    def test_chat_and_named_dirs_are_not_capture_folders(self):
        chat = self.inbox / "chat"
        photos = self.inbox / "Photos"
        stamped = self.inbox / "20260911-072507"
        chat.mkdir()
        photos.mkdir()
        stamped.mkdir()
        self.assertFalse(R.is_capture_folder(chat))
        self.assertFalse(R.is_capture_folder(photos))
        self.assertTrue(R.is_capture_folder(stamped))

    def test_folder_resolves_from_local_html_without_network(self):
        folder = self.inbox / "20260911-072507"
        folder.mkdir()
        (folder / "page.html").write_text(
            "<html><head><title>The Silicon Man</title>"
            '<link rel="canonical" href="https://example.com/silicon">'
            "</head></html>",
            encoding="utf-8",
        )
        (folder / "PDF document.pdf").write_bytes(b"%PDF-1.4")
        (folder / "note.rtf").write_text(
            r"{\rtf1 See this Instagram post by @ginevra}",
            encoding="utf-8",
        )
        stats = {
            "resolved": 0,
            "skipped": 0,
            "in_place": 0,
            "fetch_failed": 0,
        }
        with mock.patch.object(R, "safe_urlopen", side_effect=AssertionError("no network")):
            with mock.patch.object(R, "fetch", side_effect=AssertionError("no fetch")):
                R.process_folder(folder, stats, network_approved=False)
        self.assertEqual(stats["resolved"], 1)
        derivative = self.out / "20260911-072507-link.md"
        body = derivative.read_text(encoding="utf-8")
        self.assertIn(R.UNTRUSTED_HEADER.strip(), body)
        self.assertIn("https://example.com/silicon", body)
        self.assertIn("The Silicon Man", body)
        self.assertIn("@ginevra", body)
        self.assertFalse(folder.exists())
        self.assertTrue((self.out / "20260911-072507").is_dir())

    def test_x_html_in_folder_uses_tweet_path_only_with_network(self):
        folder = self.inbox / "20260911-080000"
        folder.mkdir()
        (folder / "status.html").write_text(
            "https://x.com/alice/status/1234567890123456789",
            encoding="utf-8",
        )
        tweet = {
            "id": "1234567890123456789",
            "author": {"screen_name": "alice", "name": "Alice"},
            "text": "hello",
            "url": "https://x.com/alice/status/1234567890123456789",
            "created_at": "now",
            "likes": 0,
            "retweets": 0,
            "replies": 0,
            "bookmarks": 0,
            "quotes": 0,
            "views": 0,
        }
        stats = {"resolved": 0, "skipped": 0, "in_place": 0, "fetch_failed": 0}
        with mock.patch.object(R, "fetch", return_value=tweet) as fetch:
            with mock.patch.object(R, "fetch_media", return_value=[]):
                R.process_folder(folder, stats, network_approved=True)
        fetch.assert_called_once_with("1234567890123456789")
        dest = self.out / "20260911-080000-alice-1234567890123456789.md"
        self.assertTrue(dest.exists())
        self.assertIn("hello", dest.read_text(encoding="utf-8"))
        self.assertFalse((self.out / "20260911-080000-link.md").exists())


if __name__ == "__main__":
    unittest.main()
