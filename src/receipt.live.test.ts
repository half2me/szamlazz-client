import { describe, expect, it } from 'vitest'
import type { ReceiptLineItem, ReceiptOptions } from './types.js'
import {
  Client,
  isSzamlazzError,
  NamedVATRate,
  PaymentMethod,
  ReceiptTemplate,
  ReceiptType,
  SzamlazzErrorCategory,
  SzamlazzErrorCode,
} from './index.js'

/*
 * Live receipt tests against szamlazz.hu's demo account. Every receipt issued
 * here is reversed again.
 *
 * The demo account is shared with everyone who uses it, and a receipt prefix
 * cannot be one that another account with the same tax number already uses
 * (code 200). Should that ever happen to the default, pick a free one with
 * SZAMLAZZ_RECEIPT_PREFIX — at most 5 uppercase letters and digits.
 */
const PREFIX = process.env.SZAMLAZZ_RECEIPT_PREFIX ?? 'SZCT'

const items: ReceiptLineItem[] = [
  {
    id: 'sku-1',
    name: 'Monthly pass',
    amount: 1,
    amountName: 'db',
    netUnitPrice: 787.4,
    vatRate: 27,
    netAmount: 787.4,
    taxAmount: 212.6,
    grossAmount: 1000,
    ledger: { revenue: '911', vat: '467' },
  },
  {
    name: 'Locker',
    amount: 2,
    amountName: 'db',
    netUnitPrice: 500,
    vatRate: NamedVATRate.AAM,
    netAmount: 1000,
    taxAmount: 0,
    grossAmount: 1000,
  },
]

const options = (): ReceiptOptions => {
  // Unique per run: the call id must never repeat, and a lookup by order number returns the newest match.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    prefix: PREFIX,
    paymentMethod: PaymentMethod.Card,
    currency: 'HUF',
    comment: 'Bérlet',
    orderNumber: `order-${stamp}`,
    callId: `pay-${stamp}`,
    payments: [
      { method: 'SZÉP kártya', amount: 1500, description: 'OTP SZÉP kártya' },
      { method: 'bankkártya', amount: 500 },
    ],
  }
}

describe.each([
  { name: 'credential auth', client: new Client({ username: 'demo', password: 'demo' }) },
  { name: 'API key auth', client: new Client({ key: '97039xbwy2gws4iv7yn4xk8cniuird56tyamat6gy3' }) },
])('Receipts ($name)', ({ client }) => {
  it('should issue, find, refuse to duplicate, and reverse a receipt', { timeout: 60000 }, async () => {
    const opts = options()
    const receipt = await client.createReceipt({ ...opts, downloadPDF: true }, items)

    expect(receipt.number).toMatch(new RegExp(`^${PREFIX}-\\d{4}-\\d+$`))
    expect(receipt).toMatchObject({
      type: ReceiptType.Receipt,
      reversed: false,
      callId: opts.callId,
      orderNumber: opts.orderNumber,
      currency: 'HUF',
      totals: { net: 1787.4, tax: 212.6, gross: 2000 },
    })
    expect(receipt.items.map((i) => [i.vatRate, i.vatType])).toEqual([
      [27, undefined],
      [0, NamedVATRate.AAM],
    ])
    expect(receipt.items[0].ledger).toEqual({ revenue: '911', vat: '467' })
    expect(receipt.payments.map((p) => p.amount)).toEqual([1500, 500])
    expect(receipt.pdf!.subarray(0, 5).toString()).toBe('%PDF-')

    // The same call id again is refused instead of issuing a second receipt…
    const duplicate = await client.createReceipt(opts, items).catch((e) => e)
    expect(duplicate.code).toBe(SzamlazzErrorCode.DuplicateReceiptCallId)

    // …and every selector leads back to the one that exists.
    for (const query of [
      { receiptNumber: receipt.number },
      { orderNumber: opts.orderNumber! },
      { callId: opts.callId! },
    ]) {
      expect((await client.findReceipt(query))?.number).toBe(receipt.number)
    }

    const withPdf = await client.findReceipt(
      { receiptNumber: receipt.number },
      { pdf: true, template: ReceiptTemplate.Narrow80mm },
    )
    expect(withPdf!.pdf!.subarray(0, 5).toString()).toBe('%PDF-')

    const storno = await client.reverseReceipt(receipt.number, { callId: `storno-${opts.callId}` })
    expect(storno).toMatchObject({
      type: ReceiptType.Reversal,
      reversed: true,
      reversedReceiptNumber: receipt.number,
      totals: { net: -1787.4, tax: -212.6, gross: -2000 },
    })
    expect(storno.number).not.toBe(receipt.number)

    const after = await client.findReceipt({ receiptNumber: receipt.number })
    expect(after).toMatchObject({ type: ReceiptType.Receipt, reversed: true })
    expect(after!.reversedReceiptNumber).toBeUndefined()

    // A reversed receipt, and a storno receipt, cannot be reversed — both reported as code 7.
    for (const number of [receipt.number, storno.number]) {
      await expect(client.reverseReceipt(number)).rejects.toMatchObject({ code: SzamlazzErrorCode.MissingData })
    }
  })

  it('should return null for a receipt that does not exist', async () => {
    expect(await client.findReceipt({ receiptNumber: `${PREFIX}-1999-999999` })).toBeNull()
    expect(await client.findReceipt({ orderNumber: 'NEMLETEZIKSOHANEMISFOG' })).toBeNull()
    expect(await client.findReceipt({ callId: 'NEMLETEZIKSOHANEMISFOG' })).toBeNull()
  })

  it('should report a missing receipt as code 7 when reversing or sending it', async () => {
    const missing = `${PREFIX}-1999-999999`
    await expect(client.reverseReceipt(missing)).rejects.toMatchObject({ code: SzamlazzErrorCode.MissingData })
    await expect(client.sendReceipt(missing, { to: 'customer@example.com' })).rejects.toMatchObject({
      code: SzamlazzErrorCode.MissingData,
    })
  })

  it('should email a receipt', { timeout: 60000 }, async () => {
    const receipt = await client.createReceipt({ ...options(), payments: undefined }, items)
    try {
      // Nothing was emailed yet, so there is no previous notification to resend.
      await expect(client.sendReceipt(receipt.number)).rejects.toMatchObject({ code: SzamlazzErrorCode.MissingData })

      // The demo account answers 43 for an address it cannot deliver to; anything
      // else would mean the request itself was wrong.
      const outcome = await client
        .sendReceipt(receipt.number, { to: 'customer@example.com', subject: 'Nyugta', content: 'Köszönjük!' })
        .catch((e) => e)
      if (outcome !== undefined) {
        expect(isSzamlazzError(outcome) && outcome.code).toBe(SzamlazzErrorCode.EmailSendFailed)
      }
    } finally {
      await client.reverseReceipt(receipt.number)
    }
  })

  it.each([
    {
      name: 'a gross value that is not a whole number',
      item: { ...items[0], netUnitPrice: 787.5, netAmount: 787.5, grossAmount: 1000.1 },
      code: SzamlazzErrorCode.ReceiptGrossNotWhole,
    },
    {
      name: 'a net value with more than 2 decimals',
      item: { ...items[0], netUnitPrice: 787.405, netAmount: 787.405, taxAmount: 212.595 },
      code: SzamlazzErrorCode.ReceiptNetTooPrecise,
    },
    {
      name: 'net and VAT that do not add up to gross',
      item: { ...items[0], taxAmount: 212.59 },
      code: SzamlazzErrorCode.ItemGrossValueMismatch,
    },
  ])('should reject $name', async ({ item, code }) => {
    await expect(client.createReceipt({ ...options(), payments: undefined }, [item])).rejects.toMatchObject({
      code,
      category: SzamlazzErrorCategory.Validation,
    })
  })

  it('should reject a malformed prefix', async () => {
    await expect(client.createReceipt({ ...options(), prefix: 'TOOLONG' }, items)).rejects.toMatchObject({
      code: SzamlazzErrorCode.InvalidPrefixFormat,
    })
  })
})

describe('Receipts (invalid auth)', () => {
  it('should throw a typed login error', async () => {
    const client = new Client({ username: 'invalid', password: 'invalid' })
    await expect(client.findReceipt({ receiptNumber: `${PREFIX}-2026-1` })).rejects.toMatchObject({
      code: SzamlazzErrorCode.LoginFailed,
      category: SzamlazzErrorCategory.Authentication,
    })
  })
})
