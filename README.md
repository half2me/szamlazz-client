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
