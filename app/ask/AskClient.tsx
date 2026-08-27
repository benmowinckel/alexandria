'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import PromptBox, { type PromptBoxHandle } from '../components/PromptBox';
import TwinText from '../components/TwinText';
import { FOUNDER_LIBRARY_ID } from '../lib/config';
import styles from './ask.module.css';

type Message = { role: 'user' | 'assistant' | 'note'; content: string };

const QUESTIONS = [
  'what happens when i start?',
  'does it work with the ai i already use?',
  'is this just better ai memory?',
  'what stays private?',
  'do i need to be technical?',
  'why start now?',
];

const ANSWER_NOTE = `Answer in no more than four short sentences, in plain language.
The reader is deciding whether to try the free loop. Answer only what they asked.
Do not tell them to pull up this page; they are already on it. Do not add a generic sales close.`;

export default function AskClient() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<PromptBoxHandle>(null);

  const ask = async (suggestion?: string) => {
    const nextQuestion = (suggestion ?? question).trim();
    if (!nextQuestion || asking) return;

    const history = messages
      .filter((message) => message.role !== 'note')
      .map((message) => ({
        role: message.role === 'user' ? 'user' as const : 'assistant' as const,
        content: message.content,
      }));

    setMessages((current) => [...current, { role: 'user', content: nextQuestion }]);
    setQuestion('');
    setAsking(true);

    try {
      const response = await fetch(`/api/library/${FOUNDER_LIBRARY_ID}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `${nextQuestion}\n\n${ANSWER_NOTE}`,
          variant: 'context',
          artifact: { name: 'ask', scope: 'public' },
          messages: history,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body.answer) {
        throw new Error('The answer is unavailable right now. You can still start the free loop.');
      }

      const answer = String(body.answer)
        .replace(/\bAIs\b/g, 'ais')
        .replace(/\bAI\b/g, 'ai');
      setMessages((current) => [...current, { role: 'assistant', content: answer }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'note',
        content: error instanceof Error
          ? error.message
          : 'The answer is unavailable right now. You can still start the free loop.',
      }]);
    } finally {
      setAsking(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className={styles.page}>
      <ThemeToggle />

      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="back to alexandria">
          <span aria-hidden>‹</span>
          <span>alexandria.</span>
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="ask-title">
          <div>
            <h1 id="ask-title">before you start.</h1>
            <p className={styles.lede}>Ask the question you actually have.</p>
          </div>

          <div className={styles.shortVersion}>
            <p className={styles.label}>the short version.</p>
            <p>
              Your ai keeps one living record of you in files on your computer,
              then uses it whenever it helps. You stop starting from zero. The
              loop is free.
            </p>
          </div>
        </section>

        <section className={styles.askSurface} aria-label="ask anything">
          <div className={styles.composer}>
            <PromptBox
              ref={inputRef}
              bare
              value={question}
              onChange={setQuestion}
              onSubmit={() => void ask()}
              loading={asking}
              shakeWhenBusy
              placeholder="what are you wondering?"
              fillable={false}
              ariaLabel="ask anything about alexandria"
            />
          </div>

          {messages.length > 0 || asking ? (
            <div className={styles.conversation} aria-live="polite">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={styles[message.role]}>
                  {message.role === 'assistant'
                    ? <TwinText text={message.content} />
                    : message.content}
                </div>
              ))}
              {asking ? <div className={styles.thinking}>…</div> : null}
            </div>
          ) : (
            <div className={styles.questionIndex}>
              <p className={styles.label}>questions people ask.</p>
              <div className={styles.questions}>
                {QUESTIONS.map((item) => (
                  <button key={item} type="button" onClick={() => void ask(item)}>
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Link href="/start" className={styles.startLink}>
            start your loop <span aria-hidden>→</span>
          </Link>
        </section>
      </main>
    </div>
  );
}
