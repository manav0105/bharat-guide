import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './bharat-guide.css';
import { AnswerMarkdown } from './AnswerMarkdown';
import { InstitutionCarousel } from './InstitutionCarousel';
import { sourceTitle } from '../convex/lib/answerRules';
import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { AccountDialog } from './AccountDialog';
import type { AccountMode } from './AccountDialog';
import './account.css';

type Source = { title: string; url: string };
type Answer = { answer: string; sources: Source[]; remaining: number; searchQuery?: string; rewritePath?: string };
type Turn = { id: string; question: string; result?: Answer; error?: string; searchQuery?: string; rewritePath?: string };
const CHAT_KEY = 'bharat-guide-chat-v1';
const examples = ['Update my address in the voter list', 'How to apply for a PAN card', 'Scholarships for students'];

function readChat(): Turn[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((t): t is Turn => typeof t?.id === 'string' && typeof t?.question === 'string'
      && t.question.length <= 500 && (!t.result || (typeof t.result.answer === 'string'
        && t.result.answer.length <= 4000 && Array.isArray(t.result.sources)
        && t.result.sources.every((s: Source) => typeof s.title === 'string' && /^https?:\/\//.test(s.url)))))
      .map(t => t.result || t.error ? t : { ...t, error: 'This question was not completed. Try it again.' });
  } catch { return []; }
}

function BookMark() {
  return <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
    <path d="M15 7.5C11.5 5.4 7.3 5.5 4 6.8v17c3.3-1.3 7.5-1.4 11 .7m0-17c3.5-2.1 7.7-2 11-.7v17c-3.3-1.3-7.5-1.4-11 .7m0-17v17" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 11h3m-3 4h3m8-4h3m-3 4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return <div className="source-section"><h3>Official pages used</h3>
    <ul>{sources.map(source => <li key={source.url}>
      <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${sourceTitle(source.title)} (opens in a new tab)`}>
        <span className="source-title">{sourceTitle(source.title)}</span>
      </a>
    </li>)}</ul>
  </div>;
}

export function BharatGuide() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const authToken = useAuthToken();
  const { signOut } = useAuthActions();
  const [accountMode, setAccountMode] = useState<AccountMode | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [anonymousRemaining, setAnonymousRemaining] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>(readChat);
  const [question, setQuestion] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [composerHeight, setComposerHeight] = useState(210);
  const input = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);

  async function startVisitor() {
    setConnectionError('');
    try {
      const response = await fetch('/api/visitor', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not start');
      const body = await response.json(); setRemaining(body.remaining); setAnonymousRemaining(body.anonymousRemaining); setReady(true);
    } catch { setConnectionError('Could not connect. Check your connection and try again.'); }
  }

  useEffect(() => {
    if (isAuthenticated) setAccountMode(null);
    if (!authLoading) void startVisitor();
  }, [isAuthenticated, authLoading]);
  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(turns)); } catch { /* Chat still works if browser storage is unavailable. */ }
  }, [turns]);
  useEffect(() => {
    if (!composer.current) return;
    const observer = new ResizeObserver(entries => setComposerHeight(entries[0].target.getBoundingClientRect().height));
    observer.observe(composer.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`; }
  }, [question]);
  useEffect(() => {
    if (!turns.length) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
    return () => cancelAnimationFrame(frame);
  }, [turns, composerHeight]);

  function newChat() {
    const wasPending = inFlight.current;
    generation.current++; request.current?.abort(); inFlight.current = false;
    setTurns([]); setQuestion(''); setBusy(false);
    try { sessionStorage.removeItem(CHAT_KEY); } catch { /* No persistent chat to clear. */ }
    input.current?.focus(); window.scrollTo({ top: 0 });
    if (wasPending) void startVisitor();
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || !ready || authLoading || inFlight.current || remaining === 0) return;
    if (!isAuthenticated && anonymousRemaining === 0) { setAccountMode('signUp'); return; }
    const currentGeneration = generation.current;
    const submitted = question.trim(); const id = crypto.randomUUID();
    const history = turns.filter(t => t.result).slice(-3).map(t => ({ question: t.question, answer: t.result!.answer }));
    const controller = new AbortController(); request.current = controller;
    inFlight.current = true; setBusy(true); setQuestion('');
    setTurns(old => [...old, { id, question: submitted }]);
    try {
      const response = await fetch('/api/ask', { method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify({ question: submitted, history }) });
      const body = await response.json();
      if (generation.current !== currentGeneration) return;
      if (body.code === 'SIGNUP_REQUIRED') {
        setAnonymousRemaining(0); setAccountMode('signUp'); setQuestion(submitted);
        setTurns(old => old.filter(t => t.id !== id)); return;
      }
      if (typeof body.remaining === 'number') {
        if (!isAuthenticated) setAnonymousRemaining(old => old === null ? null : Math.max(0, old - Math.max(0, (remaining ?? body.remaining) - body.remaining)));
        setRemaining(body.remaining);
      }
      setTurns(old => old.map(t => t.id !== id ? t : response.ok ? { ...t, result: body }
        : { ...t, error: body.error || 'Could not get an answer. Please try again.', searchQuery: body.searchQuery, rewritePath: body.rewritePath }));
    } catch {
      if (generation.current === currentGeneration) setTurns(old => old.map(t => t.id === id
        ? { ...t, error: 'Could not connect. Check your connection and try again.' } : t));
    } finally {
      if (generation.current === currentGeneration) { inFlight.current = false; setBusy(false); input.current?.focus(); }
    }
  }

  return <div className={`guide ${turns.length ? 'has-chat' : 'is-empty'}`}>
    <a className="skip-link" href="#question">Skip to your question</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Bharat Guide home"><BookMark /><span>Bharat Guide</span></a>
      <div className="header-actions">
        <button className="new-chat" type="button" onClick={newChat}>New chat</button>
        {isAuthenticated ? <button className="account-link" type="button" disabled={accountBusy} onClick={async () => {
          setAccountBusy(true); setAccountError('');
          try { await signOut(); } catch { setAccountError('Could not log out. Please try again.'); }
          finally { setAccountBusy(false); }
        }}>{accountBusy ? 'Logging out…' : 'Log out'}</button> : <>
          <button className="account-link" type="button" disabled={authLoading} onClick={() => setAccountMode('signIn')}>Log in</button>
          <button className="account-link" type="button" disabled={authLoading} onClick={() => setAccountMode('signUp')}>Sign up</button>
        </>}
      </div>
    </header>
    {accountError && <p className="account-notice" role="alert">{accountError}</p>}
    <main className="main-content" style={{ paddingBottom: composerHeight + 28 }}>
      {!turns.length && <div className="welcome-layout"><div className="welcome-copy">
        <div className="introduction"><h1>Answers to government questions, from official sources.</h1>
          <p>Ask in plain English. Get a clear answer, with links to the official pages.</p></div>
        <div className="suggestions"><p>Not sure where to start?</p><div className="example-list">
          {examples.map(example => <button type="button" key={example} onClick={() => { setQuestion(example); input.current?.focus(); }}>{example}</button>)}
        </div></div>
      </div><InstitutionCarousel /></div>}
      <section className="conversation" aria-label="Conversation" role="log" aria-live="polite" aria-relevant="additions text">
        {turns.map(turn => <article className="chat-turn" key={turn.id} data-testid="chat-turn">
          <div className="user-message"><span className="visually-hidden">You: </span><p>{turn.question}</p></div>
          <div className="assistant-message">
            <h2 className="message-author">Bharat Guide</h2>
            {turn.result ? <><div className="answer-text" data-testid="answer-text">
              <AnswerMarkdown answer={turn.result.answer} sources={turn.result.sources} /></div>{turn.result.searchQuery && <p className="searched-query" data-testid="searched-query">Searched: {turn.result.searchQuery} - {turn.result.rewritePath}</p>}<Sources sources={turn.result.sources} /></>
              : turn.error ? <div className="error-message" role="alert"><p>{turn.error}</p>{turn.searchQuery && <p className="searched-query" data-testid="searched-query">Searched: {turn.searchQuery} - {turn.rewritePath}</p>}
                <button type="button" onClick={() => { setQuestion(turn.question); input.current?.focus(); }}>Try again</button></div>
                : <div className="searching" role="status"><span className="loading-dot" />Reading the government pages…</div>}
          </div>
        </article>)}
      </section>
      <div className="thread-end" aria-hidden="true" />
    </main>
    <div className="chat-composer" ref={composer}>
      <form className="question-form" onSubmit={ask} aria-busy={busy}>
        <label className="visually-hidden" htmlFor="question">What would you like to know?</label>
        <div className="composer-row"><textarea ref={input} id="question" name="question" value={question}
          onChange={event => setQuestion(event.target.value)} maxLength={500} rows={1}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
          placeholder={turns.length ? 'Ask a follow-up…' : 'Ask about a government service…'} aria-describedby="question-help" />
          <button className="ask-button" type="submit" aria-label="Find an answer" disabled={!question.trim() || !ready || authLoading || busy || remaining === 0}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m4 10 6-6 6 6M10 4v12" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button></div>
        <div className="composer-meta"><p id="question-help">Enter to send · Shift+Enter for a new line</p>
          <div className="daily-allowance" role="status">{remaining === 0 ? 'You have used your 20 questions today. Come back tomorrow.'
            : remaining !== null ? `${remaining} of 20 questions left today` : 'Connecting…'}</div></div>
        {connectionError && <div className="error-message" role="alert"><p>{connectionError}</p><button type="button" onClick={() => void startVisitor()}>Try connecting again</button></div>}
      </form>
      <p className="chat-privacy">Chat stays in this browser tab. Bharat Guide is an independent guide.</p>
    </div>
    {accountMode && <AccountDialog mode={accountMode} onMode={setAccountMode} onClose={() => setAccountMode(null)} />}
  </div>;
}
