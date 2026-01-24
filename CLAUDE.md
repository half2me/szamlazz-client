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

- **src/types.ts** - TypeScript definitions
  - `NamedVATRate` enum with Hungarian tax codes (TEHK, AAM, EUT, etc.)
  - `PaymentMethod`, `Currency`, `LanguageCode`, `InvoiceTemplate` types
  - Interfaces for invoice options, line items, customer details, and API responses

### Client Methods

- `generateInvoice(options, items)` - Creates an invoice, returns invoice number and optional PDF
- `reverseInvoice(invoiceNumber, options)` - Creates a reversal/storno invoice
- `testConnection()` - Validates API credentials by checking for a known error code
