import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convert } from 'xmlbuilder2'
import {
  Client,
  NamedVATRate,
  PaymentMethod,
  ReceiptTemplate,
  ReceiptType,
  SzamlazzError,
  SzamlazzErrorCategory,
  SzamlazzErrorCode,
} from './index.js'
import type { ReceiptLineItem, ReceiptOptions } from './types.js'

/*
 * Unlike index.test.ts these tests never reach szamlazz.hu: `fetch` is stubbed
 * and answers with fixtures shaped after the samples in the receipt docs
 * (https://docs.szamlazz.hu/agent/category/generating-a-receipt and siblings).
 * That checks the requests this client builds and how it reads the documented
 * replies — not that szamlazz.hu still answers the way its docs say.
 */

const PDF_BYTES = Buffer.from('%PDF-1.4 receipt')

const receiptReply = ({
  number = 'NYGTA-2026-1',
  type = 'NY',
  reversed = false,
  reversedNumber = '',
  callId = 'pay-123',
  pdf = false,
} = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<xmlnyugtavalasz xmlns="http://www.szamlazz.hu/xmlnyugtavalasz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlnyugtavalasz https://www.szamlazz.hu/szamla/docs/xsds/nyugtavalasz/xmlnyugtavalasz.xsd">
  <sikeres>true</sikeres>
  <hibakod></hibakod>
  <hibauzenet></hibauzenet>
  ${pdf ? `<nyugtaPdf>${PDF_BYTES.toString('base64')}</nyugtaPdf>` : ''}
  <nyugta>
    <alap>
      <id>123456</id>
      <hivasAzonosito>${callId}</hivasAzonosito>
      <nyugtaszam>${number}</nyugtaszam>
      <tipus>${type}</tipus>
      <stornozott>${reversed}</stornozott>
      <stornozottNyugtaszam>${reversedNumber}</stornozottNyugtaszam>
      <kelt>2026-11-04</kelt>
      <fizmod>bankkártya</fizmod>
      <penznem>HUF</penznem>
      <devizabank></devizabank>
      <devizaarf>0.0</devizaarf>
      <megjegyzes>Bérlet</megjegyzes>
      <fokonyvVevo></fokonyvVevo>
      <teszt>true</teszt>
      <rendelesSzam>order-1</rendelesSzam>
    </alap>
    <tetelek>
      <tetel>
        <azonosito>sku-1</azonosito>
        <megnevezes>Monthly pass</megnevezes>
        <mennyiseg>1.0</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>787.4</nettoEgysegar>
        <netto>787.4</netto>
        <afakulcs>27</afakulcs>
        <afa>212.6</afa>
        <brutto>1000.0</brutto>
        <fokonyv>
          <arbevetel>911</arbevetel>
          <afa>467</afa>
        </fokonyv>
      </tetel>
      <tetel>
        <megnevezes>Locker</megnevezes>
        <mennyiseg>2.0</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>500</nettoEgysegar>
        <nettoErtek>1000.0</nettoErtek>
        <afatipus>AAM</afatipus>
        <afakulcs>0</afakulcs>
        <afaErtek>0.0</afaErtek>
        <bruttoErtek>1000.0</bruttoErtek>
      </tetel>
    </tetelek>
    <kifizetesek>
      <kifizetes>
        <fizetoeszkoz>SZÉP kártya</fizetoeszkoz>
        <osszeg>1500.0</osszeg>
        <leiras>OTP SZÉP kártya</leiras>
      </kifizetes>
      <kifizetes>
        <fizetoeszkoz>bankkártya</fizetoeszkoz>
        <osszeg>500.0</osszeg>
      </kifizetes>
    </kifizetesek>
    <osszegek>
      <afakulcsossz>
        <afakulcs>27</afakulcs>
        <netto>787.4</netto>
        <afa>212.6</afa>
        <brutto>1000</brutto>
      </afakulcsossz>
      <afakulcsossz>
        <afatipus>AAM</afatipus>
        <afakulcs>0</afakulcs>
        <netto>1000</netto>
        <afa>0</afa>
        <brutto>1000</brutto>
      </afakulcsossz>
      <totalossz>
        <netto>1787.4</netto>
        <afa>212.6</afa>
        <brutto>2000</brutto>
      </totalossz>
    </osszegek>
  </nyugta>
</xmlnyugtavalasz>`

const receiptError = (code: number, message: string) => `<?xml version="1.0" encoding="UTF-8"?>
<xmlnyugtavalasz xmlns="http://www.szamlazz.hu/xmlnyugtavalasz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <sikeres>false</sikeres>
  <hibakod>${code}</hibakod>
  <hibauzenet>${message}</hibauzenet>
</xmlnyugtavalasz>`

const sendReply = (ok: boolean, code = '', message = '') => `<?xml version="1.0" encoding="UTF-8"?>
<xmlnyugtasendvalasz xmlns="http://www.szamlazz.hu/xmlnyugtasendvalasz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <sikeres>${ok}</sikeres>
  <hibakod>${code}</hibakod>
  <hibauzenet>${message}</hibauzenet>
</xmlnyugtasendvalasz>`

interface SentRequest {
  url: string
  field: string
  xml: string
  /** The request parsed back into xmlbuilder2's object form. */
  doc: any
}

let sent: SentRequest[]
let replies: string[]

beforeEach(() => {
  sent = []
  replies = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const form = init!.body as FormData
    const fields = [...form.keys()]
    expect(fields).toHaveLength(1)
    const file = form.get(fields[0]) as Blob
    const xml = await file.text()
    sent.push({ url: String(input), field: fields[0], xml, doc: convert(xml, { format: 'object' }) })

    const body = replies.shift()
    if (body === undefined) throw new Error('test sent more requests than it queued replies for')
    return new Response(body, { headers: { 'content-type': 'application/xml; charset=UTF-8' } })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Element names of `node`, in document order, without the namespace attributes. */
const elementsOf = (node: Record<string, unknown>) => Object.keys(node).filter((k) => !k.startsWith('@'))

const keyClient = new Client({ key: 'agent-key' })
const credentialClient = new Client({ username: 'demo', password: 'demo' })

const options: ReceiptOptions = {
  prefix: 'NYGTA',
  paymentMethod: PaymentMethod.Card,
  currency: 'HUF',
  comment: 'Bérlet',
  orderNumber: 'order-1',
  callId: 'pay-123',
}

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

describe('createReceipt', () => {
  it('posts an xmlnyugtacreate document in the nyugta_create field', async () => {
    replies.push(receiptReply())
    await keyClient.createReceipt(
      {
        ...options,
        template: ReceiptTemplate.Ticket,
        payments: [
          { method: 'SZÉP kártya', amount: 1500, description: 'OTP SZÉP kártya' },
          { method: 'bankkártya', amount: 500 },
        ],
      },
      items,
    )

    const [{ url, field, doc }] = sent
    expect(url).toBe('https://www.szamlazz.hu/szamla/')
    expect(field).toBe('action-szamla_agent_nyugta_create')

    const root = doc.xmlnyugtacreate
    expect(root['@xmlns']).toBe('http://www.szamlazz.hu/xmlnyugtacreate')
    expect(root['@xsi:schemaLocation']).toBe(
      'http://www.szamlazz.hu/xmlnyugtacreate https://www.szamlazz.hu/szamla/docs/xsds/nyugtacreate/xmlnyugtacreate.xsd',
    )
    expect(elementsOf(root)).toEqual(['beallitasok', 'fejlec', 'tetelek', 'kifizetesek'])

    expect(root.beallitasok).toEqual({ szamlaagentkulcs: 'agent-key', pdfLetoltes: 'false' })

    // Same order as the documented sample; fields left unset are not sent at all.
    expect(root.fejlec).toEqual({
      hivasAzonosito: 'pay-123',
      elotag: 'NYGTA',
      fizmod: 'bankkártya',
      penznem: 'HUF',
      megjegyzes: 'Bérlet',
      pdfSablon: 'J',
      rendelesSzam: 'order-1',
    })
    expect(elementsOf(root.fejlec)).toEqual([
      'hivasAzonosito',
      'elotag',
      'fizmod',
      'penznem',
      'megjegyzes',
      'pdfSablon',
      'rendelesSzam',
    ])

    const [pass, locker] = root.tetelek.tetel
    expect(pass).toEqual({
      megnevezes: 'Monthly pass',
      azonosito: 'sku-1',
      mennyiseg: '1',
      mennyisegiEgyseg: 'db',
      nettoEgysegar: '787.4',
      afakulcs: '27',
      netto: '787.4',
      afa: '212.6',
      brutto: '1000',
      fokonyv: { arbevetel: '911', afa: '467' },
    })
    expect(elementsOf(pass)).toEqual([
      'megnevezes',
      'azonosito',
      'mennyiseg',
      'mennyisegiEgyseg',
      'nettoEgysegar',
      'afakulcs',
      'netto',
      'afa',
      'brutto',
      'fokonyv',
    ])
    expect(locker.afakulcs).toBe('AAM')
    expect(locker.azonosito).toBeUndefined()

    expect(root.kifizetesek.kifizetes).toEqual([
      { fizetoeszkoz: 'SZÉP kártya', osszeg: '1500', leiras: 'OTP SZÉP kártya' },
      { fizetoeszkoz: 'bankkártya', osszeg: '500' },
    ])
  })

  it('sends credentials, the exchange rate and the PDF flag when given', async () => {
    replies.push(receiptReply())
    await credentialClient.createReceipt(
      { ...options, currency: 'EUR', exchangeRate: 395.12, exchangeBank: 'MNB', downloadPDF: true },
      [{ ...items[0], comment: 'November', dataErasureCodes: 1 }],
    )

    const root = sent[0].doc.xmlnyugtacreate
    expect(root.beallitasok).toEqual({ felhasznalo: 'demo', jelszo: 'demo', pdfLetoltes: 'true' })
    expect(root.fejlec).toMatchObject({ penznem: 'EUR', devizabank: 'MNB', devizaarf: '395.12' })
    expect(root.tetelek.tetel).toMatchObject({ megjegyzes: 'November', torloKod: '1' })
    // No payment breakdown was given, so the optional block is left out.
    expect(root.kifizetesek).toBeUndefined()
  })

  it('decodes the receipt number, totals, lines and payments', async () => {
    replies.push(receiptReply())
    const receipt = await keyClient.createReceipt(options, items)

    expect(receipt).toMatchObject({
      id: '123456',
      callId: 'pay-123',
      number: 'NYGTA-2026-1',
      type: ReceiptType.Receipt,
      reversed: false,
      issueDate: '2026-11-04',
      paymentMethod: 'bankkártya',
      currency: 'HUF',
      exchangeRate: 0,
      comment: 'Bérlet',
      test: true,
      orderNumber: 'order-1',
      totals: { net: 1787.4, tax: 212.6, gross: 2000 },
    })
    expect(receipt.reversedReceiptNumber).toBeUndefined()
    expect(receipt.exchangeBank).toBeUndefined()
    expect(receipt.pdf).toBeUndefined()

    expect(receipt.items).toEqual([
      {
        id: 'sku-1',
        name: 'Monthly pass',
        amount: 1,
        amountName: 'db',
        netUnitPrice: 787.4,
        vatRate: 27,
        vatType: undefined,
        netAmount: 787.4,
        taxAmount: 212.6,
        grossAmount: 1000,
        ledger: { revenue: '911', vat: '467' },
      },
      {
        // The docs' sample reply spells this line's amounts the invoice way
        // (nettoErtek, ...); they must be read all the same.
        id: undefined,
        name: 'Locker',
        amount: 2,
        amountName: 'db',
        netUnitPrice: 500,
        vatRate: 0,
        vatType: 'AAM',
        netAmount: 1000,
        taxAmount: 0,
        grossAmount: 1000,
        ledger: undefined,
      },
    ])
    expect(receipt.vatSummary).toEqual([
      { vatRate: 27, vatType: undefined, net: 787.4, tax: 212.6, gross: 1000 },
      { vatRate: 0, vatType: 'AAM', net: 1000, tax: 0, gross: 1000 },
    ])
    expect(receipt.payments).toEqual([
      { method: 'SZÉP kártya', amount: 1500, description: 'OTP SZÉP kártya' },
      { method: 'bankkártya', amount: 500, description: undefined },
    ])
  })

  it('returns the PDF when it was requested', async () => {
    replies.push(receiptReply({ pdf: true }))
    const receipt = await keyClient.createReceipt({ ...options, downloadPDF: true }, items)
    expect(receipt.pdf).toEqual(PDF_BYTES)
  })

  it('throws a typed error when the call id was already used', async () => {
    replies.push(receiptError(338, 'A hívásazonosító már létezik: pay-123'))

    const error = await keyClient.createReceipt(options, items).catch((e) => e)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error.code).toBe(SzamlazzErrorCode.DuplicateReceiptCallId)
    expect(error.category).toBe(SzamlazzErrorCategory.Validation)
    expect(error.message).toContain('pay-123')
  })

  it.each([
    { code: 336, expected: SzamlazzErrorCode.ReceiptPrefixUsedByInvoices },
    { code: 337, expected: SzamlazzErrorCode.InvalidPrefixFormat },
    { code: 340, expected: SzamlazzErrorCode.ReceiptPaymentMismatch },
    { code: 261, expected: SzamlazzErrorCode.ItemGrossValueMismatch },
    { code: 363, expected: SzamlazzErrorCode.ReceiptGrossNotWhole },
    { code: 364, expected: SzamlazzErrorCode.ReceiptNetTooPrecise },
    { code: 365, expected: SzamlazzErrorCode.ReceiptVatTooPrecise },
  ])('maps receipt error $code to a validation error', async ({ code, expected }) => {
    replies.push(receiptError(code, 'hiba'))

    await expect(keyClient.createReceipt(options, items)).rejects.toMatchObject({
      name: 'SzamlazzError',
      code: expected,
      category: SzamlazzErrorCategory.Validation,
    })
  })

  it('throws the raw body when a success reply carries no receipt', async () => {
    replies.push(sendReply(true))
    await expect(keyClient.createReceipt(options, items)).rejects.toThrow('xmlnyugtasendvalasz')
  })
})

describe('reverseReceipt', () => {
  it('posts an xmlnyugtast document in the nyugta_storno field', async () => {
    replies.push(receiptReply({ number: 'NYGTA-2026-2', type: 'SN', reversedNumber: 'NYGTA-2026-1' }))
    await credentialClient.reverseReceipt('NYGTA-2026-1', {
      callId: 'storno-pay-123',
      downloadPDF: true,
      template: ReceiptTemplate.Narrow80mm,
    })

    const [{ field, doc }] = sent
    expect(field).toBe('action-szamla_agent_nyugta_storno')

    const root = doc.xmlnyugtast
    expect(root['@xmlns']).toBe('http://www.szamlazz.hu/xmlnyugtast')
    expect(root['@xsi:schemaLocation']).toBe(
      'http://www.szamlazz.hu/xmlnyugtast https://www.szamlazz.hu/szamla/docs/xsds/nyugtast/xmlnyugtast.xsd',
    )
    // This schema is an xs:sequence, so the order is checked too.
    expect(elementsOf(root.beallitasok)).toEqual(['felhasznalo', 'jelszo', 'pdfLetoltes'])
    expect(root.beallitasok.pdfLetoltes).toBe('true')
    expect(root.fejlec).toEqual({ nyugtaszam: 'NYGTA-2026-1', pdfSablon: 'N', hivasAzonosito: 'storno-pay-123' })
    expect(elementsOf(root.fejlec)).toEqual(['nyugtaszam', 'pdfSablon', 'hivasAzonosito'])
  })

  it('sends only the receipt number by default', async () => {
    replies.push(receiptReply({ type: 'SN' }))
    await keyClient.reverseReceipt('NYGTA-2026-1')

    const root = sent[0].doc.xmlnyugtast
    expect(root.beallitasok).toEqual({ szamlaagentkulcs: 'agent-key', pdfLetoltes: 'false' })
    expect(root.fejlec).toEqual({ nyugtaszam: 'NYGTA-2026-1' })
  })

  it('runs the reversal flow: create, reverse, then see the original as reversed', async () => {
    replies.push(
      receiptReply({ number: 'NYGTA-2026-1' }),
      receiptReply({ number: 'NYGTA-2026-2', type: 'SN', reversedNumber: 'NYGTA-2026-1', callId: 'storno-1' }),
      receiptReply({ number: 'NYGTA-2026-1', reversed: true, reversedNumber: 'NYGTA-2026-2' }),
    )

    const original = await keyClient.createReceipt(options, items)
    const storno = await keyClient.reverseReceipt(original.number, { callId: 'storno-1' })
    const after = await keyClient.findReceipt({ receiptNumber: original.number })

    expect(sent.map((r) => r.field)).toEqual([
      'action-szamla_agent_nyugta_create',
      'action-szamla_agent_nyugta_storno',
      'action-szamla_agent_nyugta_get',
    ])
    expect(sent[1].doc.xmlnyugtast.fejlec.nyugtaszam).toBe('NYGTA-2026-1')

    // The reply describes the new storno receipt, not the reversed one.
    expect(storno.number).toBe('NYGTA-2026-2')
    expect(storno.type).toBe(ReceiptType.Reversal)
    expect(storno.reversedReceiptNumber).toBe('NYGTA-2026-1')
    expect(storno.callId).toBe('storno-1')

    expect(after!.type).toBe(ReceiptType.Receipt)
    expect(after!.reversed).toBe(true)
  })

  it('throws when the receipt was already reversed', async () => {
    replies.push(receiptError(7, 'Hiányzó adat: sztornózandó nyugta (ez a nyugta már sztornózva van: NYGTA-2026-1)'))

    const error = await keyClient.reverseReceipt('NYGTA-2026-1').catch((e) => e)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error.code).toBe(SzamlazzErrorCode.MissingData)
    expect(error.message).toContain('már sztornózva')
  })

  it('rejects an empty receipt number without sending anything', async () => {
    await expect(keyClient.reverseReceipt(' ')).rejects.toBeInstanceOf(TypeError)
    expect(sent).toHaveLength(0)
  })
})

describe('findReceipt', () => {
  it('posts an xmlnyugtaget document in the nyugta_get field', async () => {
    replies.push(receiptReply({ pdf: true }))
    const receipt = await keyClient.findReceipt(
      { receiptNumber: 'NYGTA-2026-1' },
      { pdf: true, template: ReceiptTemplate.Default },
    )

    const [{ field, doc }] = sent
    expect(field).toBe('action-szamla_agent_nyugta_get')

    const root = doc.xmlnyugtaget
    expect(root['@xmlns']).toBe('http://www.szamlazz.hu/xmlnyugtaget')
    expect(root['@xsi:schemaLocation']).toBe(
      'http://www.szamlazz.hu/xmlnyugtaget https://www.szamlazz.hu/szamla/docs/xsds/nyugtaget/xmlnyugtaget.xsd',
    )
    expect(root.beallitasok).toEqual({ szamlaagentkulcs: 'agent-key', pdfLetoltes: 'true' })
    expect(root.fejlec).toEqual({ nyugtaszam: 'NYGTA-2026-1', pdfSablon: 'A' })

    expect(receipt!.number).toBe('NYGTA-2026-1')
    expect(receipt!.totals.gross).toBe(2000)
    expect(receipt!.pdf).toEqual(PDF_BYTES)
  })

  it('looks a receipt up by order number', async () => {
    replies.push(receiptReply())
    const receipt = await keyClient.findReceipt({ orderNumber: 'order-1' })

    expect(sent[0].doc.xmlnyugtaget.fejlec).toEqual({ rendelesSzam: 'order-1' })
    expect(sent[0].doc.xmlnyugtaget.beallitasok.pdfLetoltes).toBe('false')
    expect(receipt!.orderNumber).toBe('order-1')
  })

  it('returns null for a receipt number that does not exist', async () => {
    replies.push(receiptError(339, 'Nem létező nyugtaszám.'))
    expect(await keyClient.findReceipt({ receiptNumber: 'NEMLETEZIK' })).toBeNull()
  })

  it('throws every other error', async () => {
    replies.push(receiptError(3, 'Sikertelen bejelentkezés.'))
    await expect(keyClient.findReceipt({ receiptNumber: 'NYGTA-2026-1' })).rejects.toMatchObject({
      code: SzamlazzErrorCode.LoginFailed,
      category: SzamlazzErrorCategory.Authentication,
    })
  })

  it.each([
    { name: 'no identifier', query: {} },
    { name: 'two identifiers', query: { receiptNumber: 'NYGTA-2026-1', orderNumber: 'order-1' } },
    { name: 'an empty identifier', query: { receiptNumber: '' } },
  ])('rejects a lookup with $name without sending anything', async ({ query }) => {
    await expect(keyClient.findReceipt(query as never)).rejects.toBeInstanceOf(TypeError)
    expect(sent).toHaveLength(0)
  })
})

describe('sendReceipt', () => {
  it('posts an xmlnyugtasend document in the nyugta_send field', async () => {
    replies.push(sendReply(true))
    await credentialClient.sendReceipt('NYGTA-2026-1', {
      to: 'customer@example.com',
      replyTo: 'club@example.com',
      subject: 'Nyugta',
      content: 'Köszönjük!',
    })

    const [{ field, doc }] = sent
    expect(field).toBe('action-szamla_agent_nyugta_send')

    const root = doc.xmlnyugtasend
    expect(root['@xmlns']).toBe('http://www.szamlazz.hu/xmlnyugtasend')
    expect(root['@xsi:schemaLocation']).toBe(
      'http://www.szamlazz.hu/xmlnyugtasend https://www.szamlazz.hu/szamla/docs/xsds/nyugtasend/xmlnyugtasend.xsd',
    )
    expect(elementsOf(root)).toEqual(['beallitasok', 'fejlec', 'emailKuldes'])
    expect(root.beallitasok).toEqual({ felhasznalo: 'demo', jelszo: 'demo' })
    expect(root.fejlec).toEqual({ nyugtaszam: 'NYGTA-2026-1' })
    expect(root.emailKuldes).toEqual({
      email: 'customer@example.com',
      emailReplyto: 'club@example.com',
      emailTargy: 'Nyugta',
      emailSzoveg: 'Köszönjük!',
    })
    expect(elementsOf(root.emailKuldes)).toEqual(['email', 'emailReplyto', 'emailTargy', 'emailSzoveg'])
  })

  it('still asks for the email to be sent when no details are given', async () => {
    replies.push(sendReply(true))
    await expect(keyClient.sendReceipt('NYGTA-2026-1')).resolves.toBeUndefined()
    // The schema reads a missing <emailKuldes> as "send nothing", so it is always included.
    expect(sent[0].xml).toContain('<emailKuldes/>')
  })

  it('throws the documented failure reply as a typed error', async () => {
    replies.push(sendReply(false, '7', 'Hiányzó adat: emailtargy elem.'))

    await expect(keyClient.sendReceipt('NYGTA-2026-1', { to: 'customer@example.com' })).rejects.toMatchObject({
      name: 'SzamlazzError',
      code: SzamlazzErrorCode.MissingData,
      message: 'Hiányzó adat: emailtargy elem.',
    })
  })

  it('throws ReceiptNotFound for an unknown receipt number', async () => {
    replies.push(sendReply(false, '339', 'Nem létező nyugtaszám.'))

    await expect(keyClient.sendReceipt('NEMLETEZIK')).rejects.toMatchObject({
      code: SzamlazzErrorCode.ReceiptNotFound,
      category: SzamlazzErrorCategory.NotFound,
    })
  })
})
