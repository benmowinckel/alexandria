'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import { SERVER_URL } from '../../../../lib/config';

type Visibility = 'public' | 'authors' | 'invite' | 'paid' | string;

type AuthorResponse = {
  author?: { display_name?: string | null };
  files?: Array<{ name: string; visibility: Visibility }>;
};

type SessionResponse = {
  signed_in?: boolean;
  github_login?: string | null;
};

type ApiErrorResponse = {
  error?: string;
  reason?: string;
  visibility?: string;
  checkout_url?: string;
};

const FILE_DISPLAY_NAMES: Record<string, string> = {
  shadow: 'Shadow',
  design: 'Design',
  'droplets-of-grace': 'Droplets of Grace',
  'on-love': 'On Love',
  'on-power': 'On Power',
};

const FILE_EXTENSIONS: Record<string, string> = {
  'on-love': 'pdf',
};

function fileDisplayName(name: string): string {
  return FILE_DISPLAY_NAMES[name] || name.replace(/-/g, ' ');
}

export default function OpenProtocolFileGatePage({
  params,
}: {
  params: Promise<{ author: string; name: string }>;
}) {
  const searchParams = useSearchParams();
  const [authorId, setAuthorId] = useState('');
  const [fileName, setFileName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('authors');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  // Invite code is pre-populated from URL `?invite=` so share links auto-fill.
  // If absent, the user types it. Either way it flows into the fetch's query.
  const [inviteCode, setInviteCode] = useState(() => (searchParams.get('invite') || '').trim());
  const [signedIn, setSignedIn] = useState(false);
  const [sessionLogin, setSessionLogin] = useState<string | null>(null);
  const [autoAttempted, setAutoAttempted] = useState(false);
  // Owner share-link state — held only after a fresh mint; not persisted.
  const [shareUrl, setShareUrl] = useState('');
  const [shareLabel, setShareLabel] = useState('');
  const [shareCopying, setShareCopying] = useState(false);
  const [mintingShare, setMintingShare] = useState(false);

  useEffect(() => {
    params.then(async ({ author, name }) => {
      setAuthorId(author);
      setFileName(name);
      try {
        const [authorRes, sessionRes] = await Promise.all([
          fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}`),
          fetch('/api/library/session', { credentials: 'include' }),
        ]);

        if (!authorRes.ok) throw new Error('Author not found');
        const authorData = await authorRes.json() as AuthorResponse;
        setAuthorName((authorData.author?.display_name || author).trim());

        if (sessionRes.ok) {
          const session = await sessionRes.json() as SessionResponse;
          setSignedIn(Boolean(session.signed_in));
          setSessionLogin(session.github_login || null);
        }

        const file = (authorData.files || []).find((candidate) => candidate.name === name);
        if (!file) {
          setError('file not found.');
        } else {
          setVisibility(file.visibility);
        }
      } catch {
        setError('could not load file gate.');
      } finally {
        setReady(true);
      }
    });
  }, [params]);

  const nextPath = useMemo(() => (
    `/library/${encodeURIComponent(authorId)}/open/${encodeURIComponent(fileName)}`
  ), [authorId, fileName]);

  const signInUrl = useMemo(() => (
    `${SERVER_URL}/auth/github?intent=library&next=${encodeURIComponent(nextPath)}`
  ), [nextPath]);
  const signUpUrl = useMemo(() => (
    `/signup?ref=${encodeURIComponent(authorId)}&ref_source=library`
  ), [authorId]);
  const purchaseSessionId = (searchParams.get('session_id') || '').trim();
  const canceled = searchParams.get('cancel') === '1';
  const purchased = searchParams.get('purchased') === '1' || !!purchaseSessionId;
  const fileExtension = FILE_EXTENSIONS[fileName] || 'md';
  const displayName = fileDisplayName(fileName);

  const canOwnerOpen = signedIn && sessionLogin === authorId;

  const apiFileUrl = (query?: string) => {
    const path = `/api/library/${encodeURIComponent(authorId)}/file/${encodeURIComponent(fileName)}`;
    return query ? `${path}?${query}` : path;
  };

  const buildFileQuery = (): string => {
    const params = new URLSearchParams();
    const code = inviteCode.trim();
    if (code) params.set('invite', code);
    if (purchaseSessionId) params.set('session_id', purchaseSessionId);
    return params.toString();
  };

  // ---------------------------------------------------------------------------
  // Open / copy — attempt + reflect.
  //
  // The server (authorizeFileRead) is the single source of truth for whether
  // an access is allowed. The UI no longer duplicates that decision; it sends
  // whatever credentials are available (cookie + optional invite + optional
  // session_id) and reacts to the server's response. Eliminates the whole
  // class of "UI thinks one thing while the server enforces another" bugs.
  //
  // One pragmatic exception: when the visitor is unauthenticated and the file
  // is paid, route them straight to Stripe checkout rather than wait for the
  // server's 401. Auth is the floor for the file endpoint but the checkout
  // flow accepts unauth — collecting the buyer's identity through Stripe.
  // ---------------------------------------------------------------------------

  const startUnauthCheckout = async (): Promise<boolean> => {
    const checkout = await fetch(
      `/api/library/${encodeURIComponent(authorId)}/checkout/file/${encodeURIComponent(fileName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ return_origin: window.location.origin }),
      },
    );
    const body = await checkout.json() as { url?: string; error?: string };
    if (body.url) {
      window.location.href = body.url;
      return true;
    }
    setError(body.error || 'checkout failed.');
    return false;
  };

  const openNow = async () => {
    if (!authorId || !fileName || loading) return;
    setLoading(true);
    setError('');
    try {
      // Pragmatic shortcut: unauth on a paid file goes straight to Stripe.
      if (visibility === 'paid' && !signedIn && !purchaseSessionId && !canOwnerOpen) {
        await startUnauthCheckout();
        return;
      }

      const query = buildFileQuery();
      const path = apiFileUrl(query || undefined);
      const res = await fetch(path, { credentials: 'include' });
      if (res.ok) {
        window.location.href = path;
        return;
      }
      const body = await res.json().catch(() => ({})) as ApiErrorResponse;
      // 402 + checkout_url → server tells us where to send the buyer.
      if (res.status === 402 && body.checkout_url) {
        window.location.href = body.checkout_url;
        return;
      }
      setError(body.error || 'could not open this file.');
    } catch {
      setError('could not continue.');
    } finally {
      setLoading(false);
    }
  };

  const copyNow = async () => {
    if (!authorId || !fileName || loading || copying || fileExtension !== 'md') return;
    setCopying(true);
    setError('');
    try {
      const query = buildFileQuery();
      const res = await fetch(apiFileUrl(query || undefined), { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as ApiErrorResponse;
        setError(body.error || 'could not copy this file.');
        return;
      }
      const text = await res.text();
      await navigator.clipboard.writeText(text);
    } catch {
      setError('copy failed.');
    } finally {
      setCopying(false);
    }
  };

  // Auto-attempt when the URL carried an invite code — share links should
  // "just work" without the recipient needing to press a button.
  useEffect(() => {
    if (!ready || autoAttempted) return;
    if (visibility !== 'invite') return;
    const urlInvite = (searchParams.get('invite') || '').trim();
    if (!urlInvite) return;
    setAutoAttempted(true);
    void openNow();
    // openNow uses inviteCode state, which was initialised from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, autoAttempted, visibility, searchParams]);

  // ---------------------------------------------------------------------------
  // Owner share-link — mint a new access code and display the URL.
  // ---------------------------------------------------------------------------

  const createShareLink = async () => {
    if (mintingShare) return;
    setMintingShare(true);
    setError('');
    try {
      const res = await fetch(
        `/api/library/${encodeURIComponent(authorId)}/access-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ label: shareLabel.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as ApiErrorResponse;
        setError(body.error || 'could not create share link.');
        return;
      }
      const minted = await res.json() as { code: string; label: string | null };
      const url = `${window.location.origin}${nextPath}?invite=${encodeURIComponent(minted.code)}`;
      setShareUrl(url);
    } catch {
      setError('could not create share link.');
    } finally {
      setMintingShare(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl || shareCopying) return;
    setShareCopying(true);
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard failure is rare; surface only if it happens.
      setError('clipboard blocked — copy the link manually.');
    } finally {
      setShareCopying(false);
    }
  };

  // Message reflects the viewer's actual state, not just the file's policy.
  const gateMessage = canOwnerOpen
    ? 'you are signed in as the author. open directly or copy.'
    : visibility === 'authors' && signedIn
      ? 'signed in. open this file.'
      : visibility === 'paid'
        ? 'buy access to open this file'
        : visibility === 'invite'
          ? 'enter invite code or sign in as the author'
          : visibility === 'authors'
            ? 'sign in as an author to open this file'
            : 'open this file';

  if (!ready) {
    return (
      <main style={{ maxWidth: '420px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>...</p>
      </main>
    );
  }

  const showCopyButton = fileExtension === 'md';
  const openLabel = visibility === 'paid' && !canOwnerOpen && !purchaseSessionId
    ? `buy ${displayName}.${fileExtension}`
    : `open ${displayName}.${fileExtension}`;

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '8rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <Link href={`/library/${authorId}`} style={{ textDecoration: 'none' }}>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.2rem' }}>
            {authorName || authorId}
          </p>
        </Link>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-ghost)', margin: '0 0 0.9rem' }}>
          {displayName}.{fileExtension}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 1.8rem' }}>
          {gateMessage}
        </p>

        {!signedIn && visibility !== 'public' && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0 0 1.4rem' }}>
            <a href={signInUrl} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.92rem' }} className="hover:opacity-60">
              sign in
            </a>
            <a href={signUpUrl} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.92rem' }} className="hover:opacity-60">
              sign up
            </a>
          </div>
        )}

        {canceled && visibility === 'paid' && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-ghost)', margin: '0 0 1rem' }}>
            checkout canceled. nothing charged.
          </p>
        )}
        {purchased && visibility === 'paid' && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-ghost)', margin: '0 0 1rem' }}>
            purchase complete. open your file.
          </p>
        )}

        {visibility === 'invite' && !canOwnerOpen && (
          <div style={{ margin: '0 0 1.2rem' }}>
            <input
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="invite code"
              style={{
                width: '100%',
                border: 'none',
                borderBottom: '1px solid var(--border-light)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-eb-garamond)',
                fontSize: '0.95rem',
                outline: 'none',
                padding: '0 0 0.45rem',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void openNow()}
            disabled={loading || copying}
            style={{
              fontSize: '0.95rem',
              color: 'var(--text-primary)',
              cursor: loading || copying ? 'default' : 'pointer',
              opacity: loading || copying ? 0.45 : 1,
              transition: 'opacity 0.15s',
              border: 'none',
              background: 'none',
              padding: 0,
              fontFamily: 'inherit',
            }}
            className="hover:opacity-60"
          >
            {loading ? '...' : openLabel}
          </button>
          {showCopyButton && (
            <button
              type="button"
              onClick={() => void copyNow()}
              disabled={loading || copying}
              style={{
                fontSize: '0.92rem',
                color: 'var(--text-muted)',
                cursor: loading || copying ? 'default' : 'pointer',
                opacity: loading || copying ? 0.45 : 1,
                transition: 'opacity 0.15s',
                border: 'none',
                background: 'none',
                padding: 0,
                fontFamily: 'inherit',
              }}
              className="hover:opacity-60"
            >
              {copying ? 'copying...' : 'copy'}
            </button>
          )}
        </div>

        {/* Owner-only: create share link for invite-visibility files. */}
        {canOwnerOpen && visibility === 'invite' && (
          <div style={{ margin: '1.8rem 0 0', paddingTop: '1.2rem', borderTop: '1px solid var(--border-light)' }}>
            {!shareUrl ? (
              <>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-ghost)', margin: '0 0 0.6rem' }}>
                  share this file with someone — give them a link.
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={shareLabel}
                    onChange={(e) => setShareLabel(e.target.value)}
                    placeholder="label (optional)"
                    style={{
                      flex: '1 1 auto',
                      border: 'none',
                      borderBottom: '1px solid var(--border-light)',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-eb-garamond)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      padding: '0 0 0.35rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void createShareLink()}
                    disabled={mintingShare}
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      cursor: mintingShare ? 'default' : 'pointer',
                      opacity: mintingShare ? 0.45 : 1,
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                    className="hover:opacity-60"
                  >
                    {mintingShare ? '...' : 'create link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-ghost)', margin: '0 0 0.6rem' }}>
                  share this link with whoever you want to invite:
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <code style={{
                    flex: '1 1 auto',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {shareUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyShareUrl()}
                    disabled={shareCopying}
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                      cursor: shareCopying ? 'default' : 'pointer',
                      opacity: shareCopying ? 0.45 : 1,
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                    className="hover:opacity-60"
                  >
                    {shareCopying ? '...' : 'copy'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p style={{ fontSize: '0.8rem', color: 'var(--text-whisper)', margin: '0.8rem 0 0' }}>{error}</p>}

        <div style={{ margin: '3rem 0 0', display: 'flex', gap: '1.4rem' }}>
          <Link href={`/library/${authorId}`} style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">
            back
          </Link>
          <Link href="/" style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">
            alexandria.
          </Link>
        </div>
      </main>
    </>
  );
}
