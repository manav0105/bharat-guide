# Bharat Guide public-information expansion

The original schemes import is preserved: 2,000 source documents and 18,068
chunks. The expansion appended 5,167 unique source documents and 65,676 chunks.
The verified totals are 7,167 source documents and 83,744 chunks.

The chosen source topic labels are public_services, income_tax, universities,
digital_infrastructure, government_statements and public_infrastructure.
These cover citizen services, tax, education, digital government, official
election guidance and civic infrastructure/identity providers. The labels are
broad: voter registration is tagged digital_infrastructure, while UTIITSL's PAN
application page is tagged public_infrastructure.

Each topic received at most 1,000 new good-quality documents; income_tax received
782 because one of its 783 screened source documents was already loaded. A
document with several selected labels counts toward each label's allowance but
is stored only once. Duplicate body hashes and URLs are skipped. The source
revision remains 1b76e58adbb0a69e113e27626a15b97d039d897e.

The loader always uses Hugging Face streaming=True and token=False. Topic counts
and selection scan only projected Parquet metadata columns. Body text is streamed
only for the bounded selection using a Parquet predicate; no complete dataset,
CSV archive or SQLite backup is downloaded. Temporary JSONLines contain only the
selected new chunks and are removed after the append. Each chunk has the same
maximum length of 1,000 Unicode characters and preserves the source text.

Run from the project root:

```sh
python -B scripts/expand_government_documents.py count
python -B scripts/expand_government_documents.py plan
python -B scripts/expand_government_documents.py load
```

Counts, import plans and read-back results are written to the ignored
.verification/ directory. A repeated plan reuses this expansion's existing plan;
loading it again skips already imported sources instead of creating duplicates.
The admin-only documentLoader:inventory function checks every chunk sequence,
duplicate source/chunk pairs, lengths and totals, and confirms the original import
has not changed.

Answers may now cover any subject supported by retrieved documents. Google
keyword expansion and all answer requests remain inside convex/ai.ts. Search
combines full-text and title indexes and selects up to 20 useful chunks. URLs
are taken only from evidence IDs in the retrieved data; screened academic and
agency URLs are accepted alongside .gov.in and .nic.in. Menu-only content is
discarded, while contact facts are usable for actual contact questions.

The 200-word cap, exact-evidence checks, supported partial answers, one repair
attempt, and 20 questions per browser per Indian calendar day remain in place.
An irrelevant or meaningless question still returns exactly:
I could not find this in official sources

The browser regression test covers voter address changes, PAN applications,
girls' scholarships, income-tax filing and nonsense. Run npm test and
npm run test:e2e; publish with npm run deploy. Deployment remains on the existing
project at https://dapper-cricket-388.convex.site.
