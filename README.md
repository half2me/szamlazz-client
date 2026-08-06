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
