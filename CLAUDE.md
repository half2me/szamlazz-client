# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
pnpm build      # Compile TypeScript to dist/
pnpm dev        # Watch mode compilation
pnpm test       # Vitest, against the live szamlazz.hu demo account
```

`pnpm test` is an integration suite: it issues and reverses real documents on szamlazz.hu's demo
account (`demo`/`demo` and a public Agent key), so it needs network access and takes about a minute.
CI runs it on every push. There are no mocks — the response shapes this client decodes are
undocumented in places, so a fixture would only ever assert what we already believed.

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
- `testConnection()` - Validates API credentials by looking up an invoice number that cannot exist. Returns
  `false` only for credential errors; other failures (e.g. unpaid subscription, code 136) throw a
  `SzamlazzError`
