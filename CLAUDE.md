# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
pnpm build      # Compile TypeScript to dist/
pnpm dev        # Watch mode compilation
```

No test suite is configured yet.

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

- **src/types.ts** - TypeScript definitions
  - `NamedVATRate` enum with Hungarian tax codes (TEHK, AAM, EUT, etc.)
  - `PaymentMethod`, `Currency`, `LanguageCode`, `InvoiceTemplate` types
  - Interfaces for invoice options, line items, customer details, and API responses

### Client Methods

- `generateInvoice(options, items)` - Creates an invoice, returns invoice number and optional PDF
- `correctInvoice(invoiceNumber, options, items)` - Creates a correction invoice (helyesbítő számla) for an existing invoice; the original stays valid alongside the correction. The `items` are the correction deltas (typically the original items negated plus the corrected items). Equivalent to `generateInvoice` with `correctedInvoiceNumber` set.
- `reverseInvoice(invoiceNumber, options)` - Creates a reversal/storno invoice
- `testConnection()` - Validates API credentials by checking for a known error code. Returns `false` only for
  credential errors; other failures (e.g. unpaid subscription, code 136) throw a `SzamlazzError`
