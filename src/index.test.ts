import { describe, it, expect } from 'vitest'
import type { InvoiceOptions, LineItem } from './types.js'
import {
  Client,
  NamedVATRate,
  PaymentMethod,
  SzamlazzError,
  SzamlazzErrorCategory,
  SzamlazzErrorCode,
} from './index.js'

const defaultOptions: InvoiceOptions = {
  eInvoice: true,
  currency: 'HUF',
  sendEmail: false,
  language: 'hu',
  paymentMethod: PaymentMethod.Card,
  settled: true,
  issueDate: new Date(),
  completionDate: new Date(),
  dueDate: new Date(),
  customer: {
    name: 'Test',
    address: 'Test',
    city: 'Test',
    zip: 'TST111',
  },
}

const defaultItems: LineItem[] = [
  {
    amount: 2,
    amountName: 'db',
    grossAmount: 2000,
    netAmount: 2000,
    name: 'Widget',
    netUnitPrice: 1000,
    taxAmount: 0,
    vatRate: NamedVATRate.AAM,
  },
  {
    amount: 1,
    amountName: 'óra',
    grossAmount: 5080,
    netAmount: 4000,
    name: 'Service fee',
    netUnitPrice: 4000,
    taxAmount: 1080,
    vatRate: 27,
  },
  {
    amount: 3,
    amountName: 'db',
    grossAmount: 1500,
    netAmount: 1500,
    name: 'Tax exempt item',
    netUnitPrice: 500,
    taxAmount: 0,
    vatRate: NamedVATRate.TAM,
  },
]

/** Negates a line item so it cancels out its positive counterpart in a correction. */
const negate = (i: LineItem): LineItem => ({
  ...i,
  amount: -i.amount,
  netAmount: -i.netAmount,
  taxAmount: -i.taxAmount,
  grossAmount: -i.grossAmount,
})

async function generateAndReverse(client: Client, options?: Partial<InvoiceOptions>, items?: LineItem[]) {
  const result = await client.generateInvoice({ ...defaultOptions, ...options }, items ?? defaultItems)

  expect(result.invoice.number).toBeDefined()

  const reverseResult = await client.reverseInvoice(result.invoice.number, {
    eInvoice: true,
    issueDate: new Date(),
    completionDate: new Date(),
  })

  expect(reverseResult.invoice.number).toBeDefined()

  return result
}

describe.each([
  { name: 'credential auth', client: new Client({ username: 'demo', password: 'demo' }) },
  { name: 'API key auth', client: new Client({ key: '97039xbwy2gws4iv7yn4xk8cniuird56tyamat6gy3' }) },
])('Client ($name)', ({ client }) => {
  it('should validate with testConnection', async () => {
    expect(await client.testConnection()).toBe(true)
  })

  it('should generate and reverse an invoice', { timeout: 30000 }, async () => {
    const result = await generateAndReverse(client)
    expect(result.net).toBe(7500)
    expect(result.gross).toBe(8580)
  })

  it('should download PDF when requested', { timeout: 30000 }, async () => {
    const result = await generateAndReverse(client, { downloadPDF: true })
    expect(result.pdf).toBeInstanceOf(Buffer)
  })

  it('should find an issued invoice by order number and by invoice number', { timeout: 60000 }, async () => {
    // Unique per run: szamlazz.hu accounts can be set to reject a repeated order
    // number (error 71/152), and a lookup by order number returns the newest match.
    const orderNumber = `order-${Date.now()}`
    const issued = await client.generateInvoice({ ...defaultOptions, orderNumber }, defaultItems)

    const byOrder = await client.findInvoice({ orderNumber })
    expect(byOrder?.number).toBe(issued.invoice.number)

    const found = await client.findInvoice({ invoiceNumber: issued.invoice.number })
    expect(found).not.toBeNull()
    expect(found!.number).toBe(issued.invoice.number)
    expect(found!.totals).toEqual({ net: 7500, tax: 1080, gross: 8580 })
    expect(found!.currency).toBe('HUF')
    expect(found!.customer.name).toBe(defaultOptions.customer.name)

    // One line item per item sent, in order. A queried document reports every
    // rate as a percentage, so the two exempt items come back as 0% and name
    // their code in `vatType` instead.
    expect(found!.items.map((i) => i.name)).toEqual(defaultItems.map((i) => i.name))
    expect(found!.items.map((i) => i.vatRate)).toEqual([0, 27, 0])
    expect(found!.items.map((i) => i.vatType)).toEqual([NamedVATRate.AAM, undefined, NamedVATRate.TAM])
    expect(found!.items[1]).toMatchObject({ amount: 1, netAmount: 4000, taxAmount: 1080, grossAmount: 5080 })

    // The PDF is opt-in, since it is base64-encoded into the same response.
    expect(found!.pdf).toBeUndefined()
    const withPdf = await client.findInvoice({ invoiceNumber: issued.invoice.number }, { pdf: true })
    expect(withPdf?.pdf).toBeInstanceOf(Buffer)
    expect(withPdf!.pdf!.length).toBeGreaterThan(0)

    await client.reverseInvoice(issued.invoice.number, {
      eInvoice: true,
      issueDate: new Date(),
      completionDate: new Date(),
    })
  })

  it('should return null for a document that does not exist', async () => {
    expect(await client.findInvoice({ invoiceNumber: 'NEMLETEZIKSOHANEMISFOG' })).toBeNull()
    expect(await client.findInvoice({ orderNumber: 'NEMLETEZIKSOHANEMISFOG' })).toBeNull()
    expect(await client.findInvoice({ externalId: 'NEMLETEZIKSOHANEMISFOG' })).toBeNull()
  })

  it('should run a full correction chain', { timeout: 60000 }, async () => {
    const [widget, serviceFee, taxExempt] = defaultItems

    // 1. Original invoice with 3 items.
    const original = await client.generateInvoice(defaultOptions, defaultItems)
    expect(original.invoice.number).toBeDefined()

    // 2. Correct the ORIGINAL: remove the widget and add a new item in its place.
    const replacement: LineItem = {
      amount: 1,
      amountName: 'db',
      grossAmount: 3810,
      netAmount: 3000,
      name: 'Replacement gadget',
      netUnitPrice: 3000,
      taxAmount: 810,
      vatRate: 27,
    }
    const correction1 = await client.correctInvoice(original.invoice.number, defaultOptions, [
      negate(widget),
      replacement,
    ])
    expect(correction1.invoice.number).toBeDefined()
    expect(correction1.invoice.number).not.toBe(original.invoice.number)

    // 3. Correct again, repricing the last item. Every correction references the ORIGINAL
    //    invoice — a correction invoice itself is not correctable (API error 222).
    const taxExemptRepriced: LineItem = { ...taxExempt, netUnitPrice: 800, netAmount: 2400, grossAmount: 2400 }
    const correction2 = await client.correctInvoice(original.invoice.number, defaultOptions, [
      negate(taxExempt),
      taxExemptRepriced,
    ])
    expect(correction2.invoice.number).toBeDefined()
    expect(correction2.invoice.number).not.toBe(correction1.invoice.number)

    // 4. Final correction (also against the original): reverse the whole thing (storno via
    //    correction) by negating everything that is currently still valid.
    //    Effective state after steps 2-3: widget removed, service fee kept, item repriced.
    const currentState = [serviceFee, replacement, taxExemptRepriced]
    const finalReversal = await client.correctInvoice(original.invoice.number, defaultOptions, currentState.map(negate))
    expect(finalReversal.invoice.number).toBeDefined()
    expect(finalReversal.invoice.number).not.toBe(correction2.invoice.number)
  })
})

describe('Client (invalid auth)', () => {
  it('should reject invalid credentials', async () => {
    const client = new Client({ username: 'invalid', password: 'invalid' })
    expect(await client.testConnection()).toBe(false)
  })

  it('should reject an invalid API key', async () => {
    const client = new Client({ key: 'invalid-api-key' })
    expect(await client.testConnection()).toBe(false)
  })

  it('should throw a typed login error when issuing an invoice', async () => {
    const client = new Client({ username: 'invalid', password: 'invalid' })

    await expect(client.generateInvoice(defaultOptions, defaultItems)).rejects.toMatchObject({
      name: 'SzamlazzError',
      code: SzamlazzErrorCode.LoginFailed,
      category: SzamlazzErrorCategory.Authentication,
    })
  })

  it('should throw rather than report "not found" when looking up with bad credentials', async () => {
    const client = new Client({ username: 'invalid', password: 'invalid' })

    await expect(client.findInvoice({ invoiceNumber: 'NEMLETEZIKSOHANEMISFOG' })).rejects.toMatchObject({
      name: 'SzamlazzError',
      category: SzamlazzErrorCategory.Authentication,
    })
  })
})

describe('Client (API errors)', () => {
  const client = new Client({ username: 'demo', password: 'demo' })

  it('should throw a typed error for an item whose totals do not add up', { timeout: 30000 }, async () => {
    // Only the net formula is violated (999 != 1000 * 2); VAT and gross still add up,
    // so szamlazz.hu reports the net mismatch rather than a follow-up gross mismatch.
    const broken: LineItem = { ...defaultItems[0], netAmount: 999, grossAmount: 999 }

    const error = await client.generateInvoice(defaultOptions, [broken]).catch((e) => e)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error.code).toBe(SzamlazzErrorCode.ItemNetValueMismatch)
    expect(error.category).toBe(SzamlazzErrorCategory.Validation)
    // The message names the offending product, which is only in the response body.
    expect(error.message).toContain(broken.name)
    expect(error.response).toContain('<hibakod>')
  })
})
