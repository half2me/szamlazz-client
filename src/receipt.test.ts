import { readFileSync } from 'node:fs'
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
 * Fast receipt tests: `fetch` is stubbed, so nothing reaches szamlazz.hu.
 *
 * The replies are real ones, captured from the demo account into
 * test/fixtures/receipt/. Two shapes could not be captured there — a successful
 * send (the demo account cannot deliver mail) and a reply carrying a PDF, which
 * is too large to keep — so those are built from the docs' samples instead.
 * src/receipt.live.test.ts runs the same flows against the real API.
 */

const fixture = (name: string) => readFileSync(new URL(`../test/fixtures/receipt/${name}`, import.meta.url), 'utf8')

const CREATED = 'SZCT-2026-15'
const STORNO = 'SZCT-2026-16'

const PDF_BYTES = Buffer.from('%PDF-1.4 receipt')

/** The docs' sample reply, with a PDF; it spells line amounts the invoice way (`nettoErtek`, ...). */
const docsSampleWithPdf = `<?xml version="1.0" encoding="UTF-8"?>
<xmlnyugtavalasz xmlns="http://www.szamlazz.hu/xmlnyugtavalasz">
  <sikeres>true</sikeres>
  <nyugtaPdf>${PDF_BYTES.toString('base64')}</nyugtaPdf>
  <nyugta>
    <alap>
      <id>123456</id>
      <nyugtaszam>NYGT-2017-123</nyugtaszam>
      <tipus>NY</tipus>
      <stornozott>false</stornozott>
      <kelt>2015-12-01</kelt>
      <fizmod>cash</fizmod>
      <penznem>EUR</penznem>
      <devizabank>MNB</devizabank>
      <devizaarf>210</devizaarf>
      <teszt>false</teszt>
    </alap>
    <tetelek>
      <tetel>
        <megnevezes>Puppy doormat</megnevezes>
        <mennyiseg>2.0</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>10000</nettoEgysegar>
        <nettoErtek>20000.0</nettoErtek>
        <afakulcs>27</afakulcs>
        <afaErtek>5400.0</afaErtek>
        <bruttoErtek>25400.0</bruttoErtek>
      </tetel>
    </tetelek>
    <osszegek>
      <afakulcsossz><afakulcs>27</afakulcs><netto>20000</netto><afa>5400</afa><brutto>25400</brutto></afakulcsossz>
      <totalossz><netto>20000</netto><afa>5400</afa><brutto>25400</brutto></totalossz>
    </osszegek>
  </nyugta>
</xmlnyugtavalasz>`

/** The docs' sample of a successful send. */
const docsSendSuccess = `<?xml version="1.0" encoding="UTF-8"?>
<xmlnyugtasendvalasz xmlns="http://www.szamlazz.hu/xmlnyugtasendvalasz">
  <sikeres>true</sikeres>
  <hibakod></hibakod>
  <hibauzenet></hibauzenet>
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
    const xml = await (form.get(fields[0]) as Blob).text()
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
  prefix: 'SZCT',
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
    replies.push(fixture('create.xml'))
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
      elotag: 'SZCT',
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
    replies.push(fixture('create.xml'))
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
    replies.push(fixture('create.xml'))
    const receipt = await keyClient.createReceipt(options, items)

    expect(receipt).toMatchObject({
      id: '90476166',
      callId: 'pay-1793796523970',
      number: CREATED,
      type: ReceiptType.Receipt,
      reversed: false,
      issueDate: '2026-11-04',
      paymentMethod: 'bankkártya',
      currency: 'HUF',
      exchangeRate: 0,
      comment: 'Bérlet',
      test: true,
      orderNumber: 'order-1793796523970',
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
        // A named rate comes back as 0% with the code in <afatipus>.
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

  it('decodes the docs-sample shape: a PDF, a foreign currency and invoice-style amount names', async () => {
    replies.push(docsSampleWithPdf)
    const receipt = await keyClient.createReceipt({ ...options, downloadPDF: true }, items)

    expect(receipt.pdf).toEqual(PDF_BYTES)
    expect(receipt).toMatchObject({ currency: 'EUR', exchangeBank: 'MNB', exchangeRate: 210 })
    expect(receipt.items[0]).toMatchObject({ netAmount: 20000, taxAmount: 5400, grossAmount: 25400 })
  })

  it('throws a typed error when the call id was already used', async () => {
    replies.push(fixture('error-338-duplicate-call-id.xml'))

    const error = await keyClient.createReceipt(options, items).catch((e) => e)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error.code).toBe(SzamlazzErrorCode.DuplicateReceiptCallId)
    expect(error.category).toBe(SzamlazzErrorCategory.Validation)
    expect(error.message).toContain('hívásazonosító')
  })

  it.each([
    { name: 'error-336-prefix-used-by-invoices.xml', code: SzamlazzErrorCode.ReceiptPrefixUsedByInvoices },
    { name: 'error-363-gross-not-whole.xml', code: SzamlazzErrorCode.ReceiptGrossNotWhole },
  ])('maps $name to a validation error', async ({ name, code }) => {
    replies.push(fixture(name))

    await expect(keyClient.createReceipt(options, items)).rejects.toMatchObject({
      name: 'SzamlazzError',
      code,
      category: SzamlazzErrorCategory.Validation,
    })
  })

  it('throws the raw body when a success reply carries no receipt', async () => {
    replies.push(docsSendSuccess)
    await expect(keyClient.createReceipt(options, items)).rejects.toThrow('xmlnyugtasendvalasz')
  })
})

describe('reverseReceipt', () => {
  it('posts an xmlnyugtast document in the nyugta_storno field', async () => {
    replies.push(fixture('reverse.xml'))
    await credentialClient.reverseReceipt(CREATED, {
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
    expect(root.fejlec).toEqual({ nyugtaszam: CREATED, pdfSablon: 'N', hivasAzonosito: 'storno-pay-123' })
    expect(elementsOf(root.fejlec)).toEqual(['nyugtaszam', 'pdfSablon', 'hivasAzonosito'])
  })

  it('sends only the receipt number by default', async () => {
    replies.push(fixture('reverse.xml'))
    await keyClient.reverseReceipt(CREATED)

    const root = sent[0].doc.xmlnyugtast
    expect(root.beallitasok).toEqual({ szamlaagentkulcs: 'agent-key', pdfLetoltes: 'false' })
    expect(root.fejlec).toEqual({ nyugtaszam: CREATED })
  })

  it('runs the reversal flow: create, reverse, then see the original as reversed', async () => {
    replies.push(fixture('create.xml'), fixture('reverse.xml'), fixture('query-reversed.xml'))

    const original = await keyClient.createReceipt(options, items)
    const storno = await keyClient.reverseReceipt(original.number, { callId: 'storno-1' })
    const after = await keyClient.findReceipt({ receiptNumber: original.number })

    expect(sent.map((r) => r.field)).toEqual([
      'action-szamla_agent_nyugta_create',
      'action-szamla_agent_nyugta_storno',
      'action-szamla_agent_nyugta_get',
    ])
    expect(sent[1].doc.xmlnyugtast.fejlec.nyugtaszam).toBe(CREATED)

    // The reply describes the new storno receipt, not the reversed one. szamlazz.hu
    // marks the storno itself as `stornozott` too, so `type` is what tells them apart.
    expect(storno).toMatchObject({
      number: STORNO,
      type: ReceiptType.Reversal,
      reversed: true,
      reversedReceiptNumber: CREATED,
      totals: { net: -1787.4, tax: -212.6, gross: -2000 },
    })
    expect(storno.items.map((i) => i.amount)).toEqual([-1, -2])
    expect(storno.payments.map((p) => p.amount)).toEqual([-1500, -500])

    // The original is now reversed, but does not name its storno receipt.
    expect(after).toMatchObject({ number: CREATED, type: ReceiptType.Receipt, reversed: true })
    expect(after!.reversedReceiptNumber).toBeUndefined()
  })

  it('throws MissingData when the receipt was already reversed', async () => {
    replies.push(fixture('error-7-already-reversed.xml'))

    const error = await keyClient.reverseReceipt(CREATED).catch((e) => e)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error.code).toBe(SzamlazzErrorCode.MissingData)
    expect(error.message).toContain('már sztornózták')
  })

  it('rejects an empty receipt number without sending anything', async () => {
    await expect(keyClient.reverseReceipt(' ')).rejects.toBeInstanceOf(TypeError)
    expect(sent).toHaveLength(0)
  })
})

describe('findReceipt', () => {
  it('posts an xmlnyugtaget document in the nyugta_get field', async () => {
    replies.push(docsSampleWithPdf)
    const receipt = await keyClient.findReceipt(
      { receiptNumber: CREATED },
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
    expect(root.fejlec).toEqual({ nyugtaszam: CREATED, pdfSablon: 'A' })
    expect(receipt!.pdf).toEqual(PDF_BYTES)
  })

  it.each([
    { query: { orderNumber: 'order-1' }, fejlec: { rendelesSzam: 'order-1' } },
    { query: { callId: 'pay-123' }, fejlec: { hivasAzonosito: 'pay-123' } },
  ])('looks a receipt up by $fejlec', async ({ query, fejlec }) => {
    replies.push(fixture('create.xml'))
    const receipt = await keyClient.findReceipt(query)

    expect(sent[0].doc.xmlnyugtaget.fejlec).toEqual(fejlec)
    expect(sent[0].doc.xmlnyugtaget.beallitasok.pdfLetoltes).toBe('false')
    expect(receipt!.number).toBe(CREATED)
  })

  it('returns null for a receipt that does not exist', async () => {
    replies.push(fixture('error-339-not-found.xml'))
    expect(await keyClient.findReceipt({ receiptNumber: 'NEMLETEZIK' })).toBeNull()
  })

  it('throws every other error', async () => {
    replies.push(fixture('error-7-already-reversed.xml'))
    await expect(keyClient.findReceipt({ receiptNumber: CREATED })).rejects.toMatchObject({
      code: SzamlazzErrorCode.MissingData,
    })
  })

  it.each([
    { name: 'no identifier', query: {} },
    { name: 'two identifiers', query: { receiptNumber: CREATED, orderNumber: 'order-1' } },
    { name: 'an empty identifier', query: { callId: '' } },
  ])('rejects a lookup with $name without sending anything', async ({ query }) => {
    await expect(keyClient.findReceipt(query as never)).rejects.toBeInstanceOf(TypeError)
    expect(sent).toHaveLength(0)
  })
})

describe('sendReceipt', () => {
  it('posts an xmlnyugtasend document in the nyugta_send field', async () => {
    replies.push(docsSendSuccess)
    await credentialClient.sendReceipt(CREATED, {
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
    expect(root.fejlec).toEqual({ nyugtaszam: CREATED })
    expect(root.emailKuldes).toEqual({
      email: 'customer@example.com',
      emailReplyto: 'club@example.com',
      emailTargy: 'Nyugta',
      emailSzoveg: 'Köszönjük!',
    })
    expect(elementsOf(root.emailKuldes)).toEqual(['email', 'emailReplyto', 'emailTargy', 'emailSzoveg'])
  })

  it('asks for the previous notification to be resent when no details are given', async () => {
    replies.push(docsSendSuccess)
    await expect(keyClient.sendReceipt(CREATED)).resolves.toBeUndefined()
    // The schema reads a missing <emailKuldes> as "send nothing", so it is always included.
    expect(sent[0].xml).toContain('<emailKuldes/>')
  })

  it('throws MissingData, not ReceiptNotFound, for an unknown receipt number', async () => {
    replies.push(fixture('error-7-send-not-found.xml'))

    await expect(keyClient.sendReceipt('NEMLETEZIK', { to: 'customer@example.com' })).rejects.toMatchObject({
      name: 'SzamlazzError',
      code: SzamlazzErrorCode.MissingData,
      message: 'Hiányzó adat: küldendő nyugta (nincs ilyen nyugtaszám).',
    })
  })

  it('throws EmailSendFailed when szamlazz.hu could not deliver it', async () => {
    replies.push(fixture('error-43-send-failed.xml'))

    await expect(keyClient.sendReceipt(CREATED, { to: 'customer@example.com' })).rejects.toMatchObject({
      code: SzamlazzErrorCode.EmailSendFailed,
      category: SzamlazzErrorCategory.Service,
    })
  })
})
