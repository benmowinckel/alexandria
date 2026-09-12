import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PromptBox, { type PromptBoxHandle } from '../../app/components/PromptBox';
import TwinText from '../../app/components/TwinText';

// Optional presentation only. The website owns this script, its mount, colours
// and backend. No hosted iframe, account key, tracking, or page replacement.
type Message = { role: 'user' | 'assistant'; content: string };
const styles = `
 :host { display:block; font:inherit; color:inherit; text-align:left; }
 .mirror { --text-primary:var(--mirror-ink, #211e18); --text-muted:var(--mirror-muted, #8c8475); --text-ghost:var(--mirror-muted, #8c8475); --accent:var(--mirror-accent, #004996); --border-light:var(--mirror-border, #dedbd5); --bg-secondary:var(--mirror-background, transparent); --font-eb-garamond:inherit; }
 * { box-sizing:border-box; } button,textarea { font:inherit; } button,a { -webkit-tap-highlight-color:transparent; }
 a { color:var(--accent); text-decoration:underline; text-underline-offset:.18em; }
 button { color:inherit; cursor:pointer; } :focus-visible { outline:2px solid var(--accent); outline-offset:4px; }
 .messages { display:grid; gap:1.4rem; margin:0 0 1.4rem; max-height:60svh; overflow-y:auto; overscroll-behavior:contain; padding:2px 5px 2px 2px; }
 .message { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; font-size:1.05rem; }
 .question { color:var(--text-muted); } .label { display:block; font-size:.75rem; letter-spacing:.06em; margin-bottom:.3rem; color:var(--text-muted); }
 .note,.status { font-size:.86rem; line-height:1.5; color:var(--text-muted); margin:.7rem 0 0; }
 .tools { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:.9rem; }
 .tools button { padding:.4rem 0; border:0; background:none; font-size:.85rem; color:var(--text-muted); }
 @keyframes pb-caret-blink { 0%,100% { opacity:1; } 50% { opacity:.05; } }
 @media(prefers-reduced-motion:reduce) { * { animation:none!important; transition:none!important; } }
`;

function Mirror({ element }: { element: HTMLElement }) {
  const prefix = element.getAttribute('endpoint') || '/_alexandria';
  const name = element.getAttribute('name') || 'this person';
  const placeholder = element.getAttribute('placeholder') || `ask about ${name}’s thinking…`;
  const artifactName = element.getAttribute('artifact');
  const artifactScope = element.getAttribute('scope') || 'public';
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [connect, setConnect] = useState(false);
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const composer = useRef<PromptBoxHandle>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, status]);

  async function ask() {
    const question = draft.trim();
    if (!question || pending) return;
    // Configuration cannot turn this into an off-site credential-bearing call.
    if (!/^\/(?:[A-Za-z0-9_~-]+)(?:\/[A-Za-z0-9_~-]+)*$/.test(prefix)) {
      setStatus('This chat has an invalid website connection.'); return;
    }
    if (question.length > 20_000) { setStatus('Please keep the question under 20,000 characters.'); return; }
    setPending(true); setStatus(''); setConnect(false);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 90_000);
    try {
      const response = await fetch(`${prefix}/ask`, {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ question, messages: messages.slice(-10).map(m => ({ ...m, content: m.content.slice(0, 6000) })), scopes: ['public'],
          ...(artifactName ? { artifact: { name: artifactName, scope: artifactScope } } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setConnect(response.status === 401);
        setStatus(result.reason === 'mirror_unavailable'
          ? 'The answering model is not connected yet. You can still read the published work below.'
          : response.status === 401 ? 'Connect your reader identity to continue.'
          : response.status === 429 ? 'The mirror is busy. Please try again shortly.'
          : 'This computer is offline, so the personal language model could not answer just now. Try again in a moment.');
        return;
      }
      if (typeof result.answer !== 'string' || !result.answer.trim() || result.answer.length > 100_000) throw new Error('Invalid answer');
      setMessages(previous => [...previous, { role: 'user', content: question }, { role: 'assistant', content: result.answer }].slice(-40) as Message[]);
      setDraft('');
    } catch {
      if (controller.current === abort) setStatus('This computer is offline, so the personal language model could not answer just now. Try again in a moment.');
    } finally {
      clearTimeout(timeout); setPending(false);
      requestAnimationFrame(() => composer.current?.focus());
    }
  }

  return <div className="mirror">
    <style>{styles}</style>
    {messages.length > 0 && <>
      <div className="tools">
        <button onClick={() => { setMessages([]); setStatus(''); composer.current?.focus(); }} disabled={pending}>new conversation</button>
        <button onClick={async () => {
          try { await navigator.clipboard.writeText(messages.map(m => `${m.role === 'user' ? 'you' : 'mirror'}: ${m.content}`).join('\n\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          catch { setStatus('Copy is unavailable in this browser. You can select the conversation text.'); }
        }}>{copied ? 'copied' : 'copy conversation'}</button>
      </div>
      <div className="messages" ref={log} role="log" aria-label="Mirror conversation" aria-live="polite" aria-relevant="additions">
        {messages.map((message, index) => <div key={index} className={`message ${message.role === 'user' ? 'question' : ''}`}>
          <span className="label">{message.role === 'user' ? 'you' : 'mirror'}</span><TwinText text={message.content} />
        </div>)}
      </div>
    </>}
    <PromptBox ref={composer} value={draft} onChange={setDraft} onSubmit={ask} loading={pending}
      placeholder={placeholder} ariaLabel={`Ask ${name}’s mirror`} fillable={false} />
    {pending && <p className="status" role="status">thinking…</p>}
    {status && <p className="status" role="status">{status}{connect && <> <a href={`${prefix}/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`}>connect</a></>}</p>}
    <p className="note">ai reflecting {name}’s published thinking.</p>
  </div>;
}

class AlexandriaMirror extends HTMLElement {
  private root?: Root;
  connectedCallback() {
    if (this.root) return;
    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' });
    this.root = createRoot(shadow); this.root.render(<Mirror element={this} />);
  }
  disconnectedCallback() { this.root?.unmount(); this.root = undefined; }
}
if (!customElements.get('alexandria-mirror')) customElements.define('alexandria-mirror', AlexandriaMirror);
