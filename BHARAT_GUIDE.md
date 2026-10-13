# Bharat Guide

One screen for questions about government schemes. Answers come only from the
loaded Convex chunks and link to the exact government pages used.

## Run locally

```sh
npm install
npm run dev
```

The Vite server forwards `/api` requests to `CONVEX_SITE_URL` in `.env.local`.
No provider key goes in `.env.local`, frontend code, or the browser.

Set `GOOGLE_API_KEY` in the existing Convex deployment's environment variables.
Every AI call is inside the single `answer` action in `convex/ai.ts`. The current
model is `gemini-3.5-flash-lite`. Provider credentials, prompt, API request and
response handling live in that file; switching to OpenAI changes only that file.

## Data and answers

The existing `documents` table already stores the 18,068 text chunks from 2,000
source documents. Nothing reloads, edits, or deletes those records. Its existing
`search_text` full-text index is reused.

The server removes common filler words from the question, searches up to 64
ranked candidates, skips navigation/contact-only chunks and non-government
URLs, then passes the top eight remaining chunks to the action. No embeddings,
external search, browser model calls, or AI conversation history are used.

The AI can give partial information about a related welfare scheme, but every
displayed statement still needs exact evidence from a retrieved chunk. The
server checks statements individually: one malformed quotation cannot erase
other supported statements. It builds source links only for displayed facts and
keeps the answer under 200 words. If all proposed evidence fails, the action
tries one repair before showing a service retry message, not a false claim that
the database has no sources. Unrelated or out-of-scope questions return exactly
`I could not find this in official sources` with no sources. Passport/visa
administrative services are outside this welfare-benefit guide's scope, even
though incidental Passport Seva text exists in the loaded dataset.

For admin diagnosis, run `python -B scripts/diagnose_answers.py before` to
capture the three reported questions with all eight selected chunks and the raw
AI reply. Run `python -B scripts/diagnose_answers.py after` for those questions
plus the passport control. This calls the same action used by the site, with
an internal-only trace flag. No raw replies or traces reach the public HTTP API,
and provider keys are never included. Files go to the ignored `.verification/`
directory. Tracing does not change search, prompts, filters, or answer rules.

## Daily allowance

An opaque, HttpOnly visitor cookie identifies a browser without login. Only a
hash is stored in Convex. The server permits 20 questions per Indian calendar
day; counter checks and increments share one transaction. Conflicting requests
retry the counter update without repeating a model call. One evidence-repair
call, if needed, belongs to the same question and is not charged again to the
visitor's daily allowance. Reloading or opening
another tab keeps the allowance. Failed provider calls still count as attempts.

As with any cookie-based limit without login, clearing cookies or using another
browser creates a new visitor. This limits browser visitors, not verified people.

## Checks and deployment

```sh
npm test
npm run test:e2e
npm run deploy
```

The browser test uses the installed Google Chrome; no browser download is
needed. It asks five questions through the screen and checks a simultaneous
21-request quota test. Answers and screenshots are saved under `.verification/`
(ignored by Git). The rule tests cover daily reset, evidence rejection, the word
cap, navigation removal and plain wording.

`npm run deploy` pushes the backend and uploads the built screen to the existing
deployment that holds the data and key. It does not switch to an empty production
deployment or reload documents. The published address is:

https://dapper-cricket-388.convex.site

For a hosted browser test in PowerShell:

```powershell
$env:BHARAT_TEST_URL = 'https://dapper-cricket-388.convex.site'
npm run test:e2e
Remove-Item Env:BHARAT_TEST_URL
```
