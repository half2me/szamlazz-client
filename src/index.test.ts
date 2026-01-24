import { describe, it, expect } from 'vitest'
import { Client, NamedVATRate, PaymentMethod } from './index.js'

describe('Client', () => {
  const client = new Client({ username: 'demo', password: 'demo' })

  it('should generate and reverse an invoice', { timeout: 30000 }, async () => {
    const result = await client.generateInvoice(
      {
        eInvoice: true,
        currency: 'HUF',
        sendEmail: false,
        language: 'hu',
        paymentMethod: PaymentMethod.Card,
        settled: true,
        comment: 'some random comment',
        issueDate: new Date(),
        completionDate: new Date(),
        dueDate: new Date(),
        customer: {
          name: 'Test',
          address: 'Test',
          city: 'Test',
          zip: 'TST111',
        },
      },
      [
        {
          amount: 1,
          amountName: 'db',
          grossAmount: 1000,
          netAmount: 1000,
          name: 'Test',
          netUnitPrice: 1000,
          taxAmount: 0,
          vatRate: NamedVATRate.AAM,
        },
      ],
    )

    expect(result.invoice.number).toBeDefined()
    expect(result.net).toBe(1000)
    expect(result.gross).toBe(1000)

    const reverseResult = await client.reverseInvoice(result.invoice.number, {
      eInvoice: true,
      issueDate: new Date(),
      completionDate: new Date(),
    })

    expect(reverseResult.invoice.number).toBeDefined()
  })

  it('should validate credentials with testConnection', async () => {
    const isValid = await client.testConnection()
    expect(isValid).toBe(true)
  })

  it('should reject invalid credentials', async () => {
    const badClient = new Client({ username: 'invalid', password: 'invalid' })
    const isValid = await badClient.testConnection()
    expect(isValid).toBe(false)
  })
})
