## Client for Szamlazz.hu API

### Usage:

```javascript
import SZClient from '@halftome/szamlazz-client'

const client = new SZClient({ username: 'demo', password: 'demo' })

const invoice = await c.generateInvoice(
  {
    // Invoice options
  },
  [
    // List of items
  ],
)
```

### Looking up an existing document

`findInvoice()` retrieves a document szamlazz.hu has already issued, by invoice number, by the
`orderNumber` it was created with, or by its `externalId`:

```javascript
const invoice = await client.findInvoice({ orderNumber: 'order-1234' })

if (invoice) {
  console.log(invoice.number, invoice.totals.gross, invoice.items.length)
}
```

It returns `null` when no such document exists, rather than throwing — szamlazz.hu reports that with
error code 7, the same code it uses for a request that left out a required field, and only the client
knows which of the two it sent. Every other failure still throws a `SzamlazzError`.

Pass exactly one identifier. Naming none, naming two, or passing an empty string throws a `TypeError`
before anything is sent, because szamlazz.hu would answer such a request with that same code 7 — so an
unchecked one would come back as a confident `null`, and a caller looking a document up to avoid
issuing a duplicate would take that as permission to issue one.

This is the safe way to make issuing an invoice idempotent. If a call to `generateInvoice()` fails
without telling you whether the document was created — a timeout, a dropped connection, or error 56,
which means the invoice exists but its notification email did not go out — look it up by order number
before retrying, and adopt what you find instead of issuing a second document.

Two caveats worth knowing:

- The response carries no link to the document. The customer-account URL that `generateInvoice()`
  derives its `pdfUrl` from is only handed out when a document is created, so a queried invoice has a
  number but no URL. Pass `{ pdf: true }` to get the PDF bytes inline instead — it is left off by
  default because it is base64-encoded into the same response.
- Every VAT rate comes back as a percentage. A line issued with a named rate reports `vatRate: 0` and
  names its code in `vatType` (`AAM`, `TAM`, ...).

Only documents issued through szamlazz.hu itself can be retrieved this way.

### Receipts (nyugta)

Receipts are issued, reversed, looked up and emailed through their own methods. Unlike invoices they have
no customer details, no dates (a receipt is dated the day it is issued) and use a receipt-only prefix.

```javascript
import SZClient, { PaymentMethod, ReceiptTemplate, SzamlazzErrorCode, isSzamlazzError } from '@halftome/szamlazz-client'

const client = new SZClient({ key: 'your-agent-key' })

const receipt = await client.createReceipt(
  {
    prefix: 'NYGTA', // up to 5 uppercase letters and digits, not a prefix you use for invoices
    paymentMethod: PaymentMethod.Card,
    currency: 'HUF',
    comment: 'Monthly pass',
    orderNumber: 'order-1234',
    callId: 'payment-5678', // makes the call idempotent, see below
    downloadPDF: true,
    template: ReceiptTemplate.Narrow80mm, // optional: A4 (default), ticket, ticket with logo or 80 mm
    payments: [
      // optional breakdown by means of payment; must add up to the gross total
      { method: 'SZÉP kártya', amount: 6000, description: 'OTP SZÉP kártya' },
      { method: 'bankkártya', amount: 4000 },
    ],
  },
  [
    {
      name: 'Monthly pass',
      amount: 1,
      amountName: 'db',
      netUnitPrice: 7874.02,
      vatRate: 27,
      netAmount: 7874.02,
      taxAmount: 2125.98,
      grossAmount: 10000,
    },
  ],
)

console.log(receipt.number, receipt.totals.gross) // 'NYGTA-2026-1', 10000
// receipt.pdf is a Buffer when downloadPDF was set

const storno = await client.reverseReceipt(receipt.number, { callId: 'payment-5678-storno' })
console.log(storno.number, storno.type) // 'NYGTA-2026-2', 'SN' — the reply describes the new storno receipt

const found = await client.findReceipt({ receiptNumber: receipt.number }, { pdf: true }) // or { orderNumber } or { callId }
console.log(found?.reversed) // true

await client.sendReceipt(receipt.number, {
  to: 'customer@example.com',
  replyTo: 'club@example.com',
  subject: 'Your receipt',
  content: 'Thank you!',
})
```

A few rules worth knowing:

- **HUF amounts must already be rounded.** On a HUF receipt each line's `grossAmount` must be a whole number,
  `netAmount` and `taxAmount` may have at most two decimals, and `netAmount + taxAmount` must equal
  `grossAmount` exactly. szamlazz.hu rejects anything else with code 261, 363, 364 or 365.
- **Use `callId` to make retries safe.** szamlazz.hu refuses a second receipt with a call id it has already
  seen, throwing `SzamlazzErrorCode.DuplicateReceiptCallId` (338) instead of issuing a duplicate. Take the id
  from something stable, such as your payment id. On a 338 the receipt from the earlier attempt exists, and
  you can fetch it by the same call id:

  ```javascript
  try {
    return await client.createReceipt(options, items)
  } catch (e) {
    if (isSzamlazzError(e) && e.code === SzamlazzErrorCode.DuplicateReceiptCallId) {
      return await client.findReceipt({ callId: options.callId })
    }
    throw e
  }
  ```

- `findReceipt()` returns `null` for a receipt that does not exist (code 339), like `findInvoice()`.
- `reverseReceipt()` fails with code 7 (`MissingData`) for a receipt that does not exist, was already
  reversed, or is itself a storno receipt; only the message tells them apart. `sendReceipt()` also reports
  an unknown receipt as code 7, not 339.
- After a reversal both receipts read `reversed: true`: check `type` (`NY` or `SN`) to tell the original
  from its storno. Only the storno names the other one, in `reversedReceiptNumber`.
- `sendReceipt()` with no email details resends the previous notification, which fails with code 7 for a
  receipt that was never emailed. Pass at least `to`.
- A foreign-currency receipt without `exchangeRate` gets the day's MNB rate from szamlazz.hu.
- Receipts also accept the `ÁKK` VAT code, a 10% rate, and `Ft` as a currency.

### Tests

```bash
pnpm test       # unit suite: fixtures and pure logic, no network, about a second
pnpm test:live  # live suite: issues and reverses real documents on szamlazz.hu's demo account
pnpm test:all   # both
```

The unit suite runs on every push and pull request. The live suite only runs when started by hand (the
"Live API tests" workflow in GitHub Actions) and before every publish. Live tests are the `*.live.test.ts` files; the receipt fixtures under
`test/fixtures/receipt/` are replies captured from the demo account.

### Error handling

When szamlazz.hu rejects a request it answers with an error code (`<hibakod>` in the XML body, or the
`szlahu_error_code` response header). The client parses that code and throws a `SzamlazzError`:

```javascript
import SZClient, { isSzamlazzError, SzamlazzErrorCategory, SzamlazzErrorCode } from '@halftome/szamlazz-client'

try {
  await client.generateInvoice(options, items)
} catch (e) {
  if (!isSzamlazzError(e)) throw e

  switch (e.code) {
    case SzamlazzErrorCode.SubscriptionProblem: // 136
      // The szamlazz.hu subscription is unpaid or expired — tell the user to settle it.
      break
    case SzamlazzErrorCode.LoginFailed: // 3
      // Bad API key or username/password.
      break
    default:
      // Not every code szamlazz.hu can return is documented, so also branch on the category.
      if (e.category === SzamlazzErrorCategory.Validation) fixTheInvoice(e.message)
  }
}
```

`SzamlazzError` carries:

| Property   | Description                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `code`     | Raw numeric error code. Compare against `SzamlazzErrorCode`; it is `0` if no code was returned.          |
| `category` | `service`, `authentication`, `account`, `validation`, `not_found` or `unknown` — for undocumented codes. |
| `message`  | The Hungarian error message from szamlazz.hu, including details such as the offending product name.      |
| `response` | The unmodified response body, for logging.                                                               |

`testConnection()` still returns `false` for rejected credentials, but throws a `SzamlazzError` for failures
that have nothing to do with the credentials (an unpaid subscription, for example), so those are not silently
reported as a bad login.

The known codes are listed in [`src/errors.ts`](src/errors.ts); szamlazz.hu documents them at
[docs.szamlazz.hu](https://docs.szamlazz.hu/agent/basics/error-handling).
