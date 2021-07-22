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
