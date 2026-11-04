# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
pnpm build      # Compile TypeScript to dist/
pnpm dev        # Watch mode compilation
pnpm typecheck  # tsc --noEmit
pnpm test       # Unit suite: no network, about a second
pnpm test:live  # Live suite, against the szamlazz.hu demo account
pnpm test:all   # Both
```

The suites are split by file name (`vitest.config.ts` defines them as vitest projects):

- **unit** — `src/**/*.test.ts` except live ones. No network: pure logic, plus receipt tests that stub
  `fetch` and answer with replies captured from the demo account (`test/fixtures/receipt/`). CI runs it on
  every push and pull request.
- **live** — `src/**/*.live.test.ts`. Issues and reverses real documents on szamlazz.hu's demo account
  (`demo`/`demo` and a public Agent key), so it needs network access and takes about a minute. It runs in
  `.github/workflows/live.yml`, which only runs when started by hand, and before every publish.

The live suite is the source of truth: the response shapes this client decodes are undocumented in places,
and the receipt docs turned out to be wrong in several (see `src/receipt.ts` and `src/errors.ts`). When
behaviour is unclear, probe the demo account rather than trusting the docs, and refresh a fixture by
capturing the real reply. Receipts need a prefix of at most 5 characters that no other demo user's account
has taken; the live suite uses `SZCT`, overridable with `SZAMLAZZ_RECEIPT_PREFIX`.

## Architecture

This is a TypeScript client library for the [szamlazz.hu](https://szamlazz.hu) Hungarian invoicing API. It requires Node.js 20+.

### Core Components

- **src/index.ts** - `Client` class that handles API communication
  - Authenticates via API key (`KeyAuth`) or username/password (`CredentialAuth`)
  - Uses `xmlbuilder2` to construct XML requests and parse XML responses
  - Sends requests as multipart form data to `https://www.szamlazz.hu/szamla/`

- **src/errors.ts** - Error code parsing
  - `SzamlazzErrorCode` enum of the codes szamlazz.hu returns in `<hibakod>` / the `szlahu_error_code` header
  - `SzamlazzErrorCategory` groups codes so callers can branch without listing every code
  - `SzamlazzError` is thrown by every `Client` method when the API reports a failure; `parseError()` handles
    all three shapes the API uses (XML body, response headers, `[ERR] ...` plain text)
  - The documented code list is incomplete, so `code` is a raw `number` and unknown codes get category `unknown`

- **src/query.ts** - Decoder for the invoice-lookup reply
  - The query agent answers with a `<szamla>` document, a different shape from every other reply, so it
    does not go through `Client.decodeResponse`
  - The reply omits `vevoifiokurl`, so a queried invoice has no URL — only `generateInvoice` gets one

- **src/receipt.ts** - Decoders for the receipt (nyugta) replies
  - Create, storno and query all answer with the same `<xmlnyugtavalasz>` document; send answers with a
    bare `<xmlnyugtasendvalasz>`. Each receipt operation has its own request root, namespace and XSD

- **src/xml.ts** - Readers for the object form `xmlbuilder2` produces (`textOf`, `numberOf`, `listOf`, ...)
  - Absorbs the shapes a text node can take: bare string, `{ $: ... }` for CDATA, `{}` when empty, and a
    single object rather than an array when an element occurs once

- **src/types.ts** - TypeScript definitions
  - `NamedVATRate` enum with Hungarian tax codes (TEHK, AAM, EUT, etc.)
  - `PaymentMethod`, `Currency`, `LanguageCode`, `InvoiceTemplate` types
  - Interfaces for invoice options, line items, customer details, and API responses

### Client Methods

- `generateInvoice(options, items)` - Creates an invoice, returns invoice number and optional PDF
- `correctInvoice(invoiceNumber, options, items)` - Creates a correction invoice (helyesbítő számla) for an existing invoice; the original stays valid alongside the correction. The `items` are the correction deltas (typically the original items negated plus the corrected items). Equivalent to `generateInvoice` with `correctedInvoiceNumber` set.
- `reverseInvoice(invoiceNumber, options)` - Creates a reversal/storno invoice
- `findInvoice(query, options?)` - Looks up an already-issued document by invoice number, order number or
  external id. Returns `null` when there is no such document instead of throwing, because szamlazz.hu
  reports that with code 7 — the same code it uses for a request missing a field, which only the client can
  tell apart. A queried document carries no URL (see `src/query.ts`); pass `{ pdf: true }` for the bytes.
  This is what makes issuing idempotent: look up by order number before retrying a `generateInvoice` whose
  outcome is unknown, rather than risking a second legal document
- `createReceipt(options, items)` - Issues a receipt. `callId` (`hivasAzonosito`) makes it idempotent: a
  reused id fails with code 338 instead of issuing a duplicate
- `reverseReceipt(receiptNumber, options?)` - Issues a storno receipt; returns the storno receipt, not the original
- `findReceipt(query, options?)` - Looks a receipt up by receipt number, order number or call id; `null` on code 339
- `sendReceipt(receiptNumber, email?)` - Emails an issued receipt. Unknown receipt → code 7, not 339
- `testConnection()` - Validates API credentials by looking up an invoice number that cannot exist. Returns
  `false` only for credential errors; other failures (e.g. unpaid subscription, code 136) throw a
  `SzamlazzError`
