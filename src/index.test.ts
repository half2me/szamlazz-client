import { describe, it, expect } from 'vitest'
import type { InvoiceOptions, LineItem } from './types.js'
import { Client, NamedVATRate, PaymentMethod } from './index.js'

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
})
