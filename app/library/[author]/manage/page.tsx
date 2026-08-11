'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ThemeToggle } from '../../../components/ThemeToggle';

const CATEGORIES = ['works', 'projects', 'shadows', 'other'] as const;
type Category = (typeof CATEGORIES)[number];
type LabelMap = Record<string, { word?: string; whisper?: string }>;
type FileRow = {
  name: string;
  title?: string | null;
  category?: string;
  subtitle?: string | null;
  questions?: string[] | null;
};

type ProfileData = {
  author?: {
    id: string; display_name?: string | null; location?: string | null;
    contact?: string | null; website?: string | null; text?: string | null;
    socials?: Array<{ label: string; url: string }> | null;
  };
  viewer?: { is_owner?: boolean };
  profile?: { order?: string[]; hidden?: string[]; labels?: LabelMap };
  files?: FileRow[];
};

const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: 0, borderRadius: '7px',
  background: 'var(--surface-raised, #f5f5f5)', color: 'var(--text-primary)',
  padding: '0.72rem 0.8rem', font: 'inherit', fontSize: '0.96rem', lineHeight: 1.35,
};
const label: CSSProperties = {
  display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem',
  fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem',
};
const section: CSSProperties = { borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem', marginTop: '2.2rem' };

function cleanOrder(value: string[] | undefined): Category[] {
  const valid = (value || []).filter((v): v is Category => CATEGORIES.includes(v as Category));
  return [...new Set([...valid, ...CATEGORIES])];
}

export default function ManageLibraryProfile({ params }: { params: Promise<{ author: string }> }) {
  const [authorId, setAuthorId] = useState('');
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [order, setOrder] = useState<Category[]>([...CATEGORIES]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<LabelMap>({});
  const [files, setFiles] = useState<FileRow[]>([]);
  const [identity, setIdentity] = useState({ display_name: '', location: '', contact: '', website: '', text: '', socials: '' });

  useEffect(() => {
    params.then(({ author }) => {
      setAuthorId(author);
      fetch(`/api/library/${encodeURIComponent(author)}`, { credentials: 'include' })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body?.error || 'Could not load the profile.');
          return body as ProfileData;
        })
        .then((body) => {
          setData(body);
          const a = body.author;
          setIdentity({
            display_name: a?.display_name || '', location: a?.location || '', contact: a?.contact || '',
            website: a?.website || '', text: a?.text || '',
            socials: (a?.socials || []).map((s) => `${s.label} | ${s.url}`).join('\n'),
          });
          setOrder(cleanOrder(body.profile?.order));
          setHidden(new Set(body.profile?.hidden || []));
          setLabels(body.profile?.labels || {});
          setFiles(body.files || []);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the profile.'));
    });
  }, [params]);

  const categories = useMemo(() => Object.fromEntries(files.map((f) => [f.name, f.category || 'works'])), [files]);
  const subtitles = useMemo(() => Object.fromEntries(files.filter((f) => f.subtitle?.trim()).map((f) => [f.name, f.subtitle!.trim()])), [files]);
  const questions = useMemo(() => Object.fromEntries(files.map((f) => [f.name, (f.questions || []).filter(Boolean)]).filter(([, qs]) => (qs as string[]).length)), [files]);

  const move = <T,>(rows: T[], index: number, delta: number): T[] => {
    const next = index + delta;
    if (next < 0 || next >= rows.length) return rows;
    const copy = [...rows];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    return copy;
  };

  const save = async () => {
    if (!authorId || saving) return;
    setSaving(true); setSaved(false); setError('');
    const socials = identity.socials.split('\n').map((line) => {
      const [name, ...rest] = line.split('|');
      return { label: name?.trim(), url: rest.join('|').trim() };
    }).filter((s) => s.label && s.url);
    const writes: Array<[string, Record<string, unknown>]> = [
      ['profile', { ...identity, socials, order, hidden: [...hidden], labels }],
      ['file-categories', { categories }],
      ['file-order', { order: files.map((f) => f.name) }],
      ['file-subtitles', { subtitles }],
      ['file-questions', { questions }],
    ];
    try {
      for (const [control, body] of writes) {
        const res = await fetch(`/api/library/${encodeURIComponent(authorId)}/${control}`, {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!res.ok) {
          const result = await res.json().catch(() => ({}));
          throw new Error(result?.error || `Could not save ${control}.`);
        }
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the profile.');
    } finally { setSaving(false); }
  };

  if (!data && !error) return <main style={{ padding: '40vh 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>...</main>;
  if (error && !data) return <main style={{ padding: '35vh 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{error}</main>;
  if (!data?.viewer?.is_owner) return (
    <main style={{ maxWidth: '620px', margin: '0 auto', padding: '30vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Only this Author can manage this profile.</p>
      <Link href={`/library/${encodeURIComponent(authorId)}`} style={{ color: 'var(--text-secondary)' }}>back to the profile</Link>
    </main>
  );

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '5.5rem 2rem 6rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header>
          <Link href={`/library/${encodeURIComponent(authorId)}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>profile</Link>
          <h1 style={{ margin: '2rem 0 0.35rem', fontSize: '2rem', fontWeight: 500, color: 'var(--text-primary)' }}>your library</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55 }}>Shape the router. Your published files keep their own words and formatting.</p>
        </header>

        <section style={section}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 1.1rem' }}>identity</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {(['display_name', 'location', 'contact', 'website'] as const).map((key) => (
              <label key={key}><span style={label}>{key.replace('_', ' ')}</span><input style={input} value={identity[key]} onChange={(e) => setIdentity({ ...identity, [key]: e.target.value })} /></label>
            ))}
          </div>
          <label style={{ display: 'block', marginTop: '1rem' }}><span style={label}>profile line</span><input style={input} maxLength={160} value={identity.text} onChange={(e) => setIdentity({ ...identity, text: e.target.value })} /></label>
          <label style={{ display: 'block', marginTop: '1rem' }}><span style={label}>links · one “name | url” per line</span><textarea style={{ ...input, minHeight: '7rem', resize: 'vertical' }} value={identity.socials} onChange={(e) => setIdentity({ ...identity, socials: e.target.value })} /></label>
        </section>

        <section style={section}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 0.35rem' }}>profile map</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.2rem' }}>Order the shelves, rename them, or hide one without unpublishing its files.</p>
          {order.map((cat, index) => (
            <div key={cat} style={{ padding: '0.8rem 0', display: 'grid', gridTemplateColumns: 'minmax(90px, 0.7fr) minmax(120px, 1fr) minmax(180px, 1.6fr)', gap: '0.7rem', alignItems: 'center' }}>
              <div>
                <button type="button" onClick={() => setOrder(move(order, index, -1))} disabled={index === 0} aria-label={`Move ${cat} up`} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>↑</button>
                <button type="button" onClick={() => setOrder(move(order, index, 1))} disabled={index === order.length - 1} aria-label={`Move ${cat} down`} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>↓</button>
                <label style={{ marginLeft: '0.35rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={!hidden.has(cat)} onChange={(e) => { const next = new Set(hidden); if (e.target.checked) next.delete(cat); else next.add(cat); setHidden(next); }} /> {cat}</label>
              </div>
              <input aria-label={`${cat} label`} style={input} placeholder={cat} value={labels[cat]?.word || ''} onChange={(e) => setLabels({ ...labels, [cat]: { ...labels[cat], word: e.target.value } })} />
              <input aria-label={`${cat} description`} style={input} placeholder="quiet description" value={labels[cat]?.whisper || ''} onChange={(e) => setLabels({ ...labels, [cat]: { ...labels[cat], whisper: e.target.value } })} />
            </div>
          ))}
        </section>

        <section style={section}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 0.35rem' }}>published files</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.2rem' }}>Choose where each file appears, the public teaser, and questions a reader can ask.</p>
          {files.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nothing published yet.</p> : files.map((file, index) => (
            <article key={file.name} style={{ borderTop: index ? '1px solid var(--border-light)' : 0, padding: '1.2rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
                <strong style={{ fontWeight: 500 }}>{file.title || file.name}</strong>
                <span>
                  <button type="button" onClick={() => setFiles(move(files, index, -1))} disabled={index === 0} aria-label={`Move ${file.name} up`} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>↑</button>
                  <button type="button" onClick={() => setFiles(move(files, index, 1))} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>↓</button>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.65fr) minmax(220px, 1.8fr)', gap: '0.8rem', marginTop: '0.8rem' }}>
                <select aria-label={`${file.name} category`} style={input} value={file.category || 'works'} onChange={(e) => setFiles(files.map((f, i) => i === index ? { ...f, category: e.target.value } : f))}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                <input aria-label={`${file.name} teaser`} style={input} placeholder="public teaser" value={file.subtitle || ''} onChange={(e) => setFiles(files.map((f, i) => i === index ? { ...f, subtitle: e.target.value } : f))} />
              </div>
              <textarea aria-label={`${file.name} suggested questions`} style={{ ...input, minHeight: '5rem', resize: 'vertical', marginTop: '0.8rem' }} placeholder="one suggested question per line" value={(file.questions || []).join('\n')} onChange={(e) => setFiles(files.map((f, i) => i === index ? { ...f, questions: e.target.value.split('\n').map((q) => q.trim()).filter(Boolean) } : f))} />
            </article>
          ))}
        </section>

        <section style={section}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 0.5rem' }}>shadows and your ai</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>A shadow is a projection you publish for one audience, never your private source. Public handoffs carry only the public shadow. A mirror uses your own model account and token; without your sidecar, it stays offline.</p>
          <a href={`/api/library/${encodeURIComponent(authorId)}/capabilities`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>open the instructions your ai reads</a>
        </section>

        <div style={{ position: 'sticky', bottom: '1rem', marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
          <span role="status" style={{ color: error ? 'var(--error, #9b2c2c)' : 'var(--text-muted)', minHeight: '1.2em' }}>{error || (saved ? 'saved' : '')}</span>
          <button type="button" onClick={save} disabled={saving} style={{ border: 0, borderRadius: '8px', background: 'var(--text-primary)', color: 'var(--background)', padding: '0.78rem 1.25rem', font: 'inherit', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'saving…' : 'save changes'}</button>
        </div>
      </main>
    </>
  );
}
