import { describe, it, expect, vi, afterEach } from 'vitest'
import { Client } from './index.js'

/*
 * Fast invoice tests: nothing here reaches szamlazz.hu. Everything that talks to
 * the API lives in invoice.live.test.ts.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Client (query validation)', () => {
  const client = new Client({ username: 'demo', password: 'demo' })

  // These must throw before anything is sent. szamlazz.hu answers a request with
  // no usable selector with code 7 — the same code findInvoice reads as "no such
  // document" — so an unvalidated empty or ambiguous query would come back as a
  // confident null, and a caller checking before issuing would issue a duplicate.
  it.each([
    { name: 'no identifier', query: {} },
    { name: 'two identifiers', query: { invoiceNumber: 'E-001', orderNumber: 'order-1' } },
    { name: 'an empty identifier', query: { orderNumber: '' } },
    { name: 'a whitespace-only identifier', query: { externalId: '   ' } },
  ])('should reject a lookup with $name', async ({ query }) => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    await expect(client.findInvoice(query as never)).rejects.toBeInstanceOf(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
