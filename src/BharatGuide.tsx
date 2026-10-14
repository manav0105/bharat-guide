import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { exampleAnswer } from './exampleAnswer';
import './bharat-guide.css';

type Answer = { answer: string; sources: { title: string; url: string }[]; remaining: number };
const examples = [
  'Update my address in the voter list',
  'How to apply for a PAN card',
  'Scholarships for students',
];

function BookMark() {
  return <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
    <path d="M15 7.5C11.5 5.4 7.3 5.5 4 6.8v17c3.3-1.3 7.5-1.4 11 .7m0-17c3.5-2.1 7.7-2 11-.7v17c-3.3-1.3-7.5-1.4-11 .7m0-17v17" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 11h3m-3 4h3m8-4h3m-3 4h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

export function BharatGuide() {
  const [question, setQuestion] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Answer | null>(null);
  const [askedQuestion, setAskedQuestion] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  async function startVisitor() {
    setError('');
    try {
      const response = await fetch('/api/visitor', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not start');
      const body = await response.json();
      setRemaining(body.remaining);
      setReady(true);
    } catch {
      setError('Could not connect. Check your connection and try again.');
    }
  }

  useEffect(() => { void startVisitor(); }, []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || !ready || inFlight.current || remaining === 0) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    const submitted = question.trim();
    setAskedQuestion(submitted);
    try {
      const response = await fetch('/api/ask', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: submitted }),
      });
      const body = await response.json();
      if (typeof body.remaining === 'number') setRemaining(body.remaining);
      if (!response.ok) {
        setError(body.error || 'Could not get an answer. Please try again.');
        return;
      }
      setResult(body);
      requestAnimationFrame(() => answerHeading.current?.focus());
    } catch {
      setError('Could not connect. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="guide">
    <a className="skip-link" href="#question">Skip to your question</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Bharat Guide home"><BookMark /><span>Bharat Guide</span></a>
      <span className="header-note">No sign-up needed</span>
    </header>
    <main className="main-content">
      <div className="introduction">
        <h1>Government services and benefits, explained.</h1>
        <p>Get a short answer, with the official pages behind it.</p>
      </div>
      <form className="question-form" onSubmit={ask} aria-busy={busy}>
        <label htmlFor="question">What would you like to know?</label>
        <textarea ref={input} id="question" name="question" value={question}
          onChange={(event) => setQuestion(event.target.value)} maxLength={500}
          placeholder="For example, which scheme helps farmers?" rows={3}
          aria-describedby="question-help" disabled={busy} />
        <div className="form-bottom">
          <p id="question-help">Ask in your own words.</p>
          <button className="ask-button" type="submit" disabled={!question.trim() || !ready || busy || remaining === 0}>
            {busy ? 'Finding an answer…' : 'Find an answer'}
            {!busy && <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m10 4 6 6-6 6M4 10h12" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        </div>
      </form>
      {!result && !busy && !error && <section className="answer-result example-answer" aria-labelledby="example-heading">
        <h2 id="example-heading">Example answer</h2>
        <p className="asked-question">{exampleAnswer.question}</p>
        <div className="answer-text" data-testid="example-answer-text">{exampleAnswer.answer.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <div className="source-section">
          <h3>Official pages used</h3>
          <ul>{exampleAnswer.sources.map((source) => <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.title} (opens in a new tab)`}>
              <span className="source-title">{source.title}</span>
              <span className="source-url">{source.url}</span>
            </a>
          </li>)}</ul>
        </div>
        <p className="example-eligibility">Eligibility depends on each scheme. Check the official page.</p>
      </section>}
      {!result && !busy && <div className="suggestions">
        <p>Not sure where to start?</p>
        <div className="example-list">{examples.map((example) => <button type="button" key={example}
          onClick={() => { setQuestion(example); input.current?.focus(); }}>{example}</button>)}</div>
      </div>}
      <div className="answer-space" aria-live="polite" aria-atomic="true">
        {busy && <div className="searching" role="status"><span className="loading-dot" />Reading the government pages…</div>}
        {error && <div className="error-message" role="alert"><p>{error}</p>{!ready && <button type="button" onClick={() => void startVisitor()}>Try connecting again</button>}</div>}
        {result && <section className="answer-result" aria-labelledby="answer-heading">
          <h2 id="answer-heading" ref={answerHeading} tabIndex={-1}>Your answer</h2>
          <p className="asked-question">{askedQuestion}</p>
          <div className="answer-text" data-testid="answer-text">{result.answer.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          {result.sources.length > 0 && <div className="source-section">
            <h3>Official pages used</h3>
            <ul>{result.sources.map((source) => <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.title} (opens in a new tab)`}>
                <span className="source-title">{source.title}</span>
                <span className="source-url">{source.url}</span>
              </a>
            </li>)}</ul>
          </div>}
        </section>}
      </div>
      <div className="daily-allowance" role="status">
        {remaining === 0 ? 'You have used your 20 questions today. Come back tomorrow.' : remaining !== null ? `${remaining} of 20 questions left today` : 'Connecting…'}
      </div>
    </main>
    <footer className="site-footer">
      <p>Answers from government pages. In simple English.</p>
      <p>Bharat Guide is an independent guide, not a government service.</p>
    </footer>
  </div>;
}
