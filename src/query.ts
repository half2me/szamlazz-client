import { convert } from 'xmlbuilder2'
import type {
  QueriedAddress,
  QueriedInvoice,
  QueriedLineItem,
  QueriedParty,
  QueriedPayment,
  QueriedTotals,
  QueriedVatSummary,
} from './types.js'
import { booleanOf, listOf, numberOf, optionalTextOf, textOf } from './xml.js'

/**
 * Decodes the `<szamla>` document the invoice query agent answers with.
 *
 * This is a different shape from every other agent reply, which is why it does
 * not go through the client's `decodeResponse`: those all return an
 * `<xmlszamlavalasz>` envelope built around a document that was just created,
 * and carry `vevoifiokurl` — the customer-account link the client derives its
 * `pdfUrl` from. A queried document has no such link, so {@link QueriedInvoice}
 * deliberately exposes no URL. The PDF itself can be requested inline instead.
 *
 * Reference: https://docs.szamlazz.hu/agent/querying_xml/response
 */

const decodeAddress = (node: any): QueriedAddress => ({
  country: optionalTextOf(node?.orszag),
  zip: optionalTextOf(node?.irsz),
  city: optionalTextOf(node?.telepules),
  address: optionalTextOf(node?.cim),
})

const decodeParty = (node: any): QueriedParty => ({
  id: optionalTextOf(node?.id),
  name: textOf(node?.nev) ?? '',
  address: decodeAddress(node?.cim),
  email: optionalTextOf(node?.email),
  taxNumber: optionalTextOf(node?.adoszam),
  euTaxNumber: optionalTextOf(node?.adoszameu),
  bankName: optionalTextOf(node?.bank?.nev),
  bankAccountNumber: optionalTextOf(node?.bank?.bankszamla),
})

const decodeLineItem = (node: any): QueriedLineItem => ({
  name: textOf(node?.nev) ?? '',
  amount: numberOf(node?.mennyiseg),
  amountName: textOf(node?.mennyisegiegyseg) ?? '',
  netUnitPrice: numberOf(node?.nettoegysegar),
  // `afakulcs` is a percentage even for an exempt line, which reports 0 and puts
  // its code (AAM, TAM, ...) in `afatipus` — an element the published response
  // reference does not mention but szamlazz.hu does send.
  vatRate: numberOf(node?.afakulcs),
  vatType: optionalTextOf(node?.afatipus),
  netAmount: numberOf(node?.netto),
  taxAmount: numberOf(node?.afa),
  grossAmount: numberOf(node?.brutto),
  comment: optionalTextOf(node?.megjegyzes),
})

const decodeTotals = (node: any): QueriedTotals => ({
  net: numberOf(node?.netto),
  tax: numberOf(node?.afa),
  gross: numberOf(node?.brutto),
})

const decodeVatSummary = (node: any): QueriedVatSummary => ({
  ...decodeTotals(node),
  vatRate: numberOf(node?.afakulcs),
  vatType: optionalTextOf(node?.afatipus),
})

const decodePayment = (node: any): QueriedPayment => ({
  date: textOf(node?.datum) ?? '',
  title: optionalTextOf(node?.jogcim),
  amount: numberOf(node?.osszeg),
  comment: optionalTextOf(node?.megjegyzes),
  bankAccountNumber: optionalTextOf(node?.bankszamlaszam),
})

/**
 * @throws {Error} carrying the raw body when the response is not a `<szamla>` document.
 */
export const decodeQueriedInvoice = (response: string): QueriedInvoice => {
  let root: any
  try {
    const doc: any = convert(response, { format: 'object' })
    root = doc?.szamla
  } catch {
    throw new Error(response)
  }
  if (!root || typeof root !== 'object') throw new Error(response)

  const base = root.alap ?? {}

  const invoice: QueriedInvoice = {
    id: optionalTextOf(base.id),
    number: textOf(base.szamlaszam) ?? '',
    type: optionalTextOf(base.tipus),
    eInvoice: booleanOf(base.eszamla),
    issueDate: textOf(base.kelt) ?? '',
    completionDate: textOf(base.telj) ?? '',
    dueDate: textOf(base.fizh) ?? '',
    paymentMethod: optionalTextOf(base.fizmod),
    currency: optionalTextOf(base.devizanem),
    exchangeRate: numberOf(base.devizaarf),
    language: optionalTextOf(base.nyelv),
    comment: optionalTextOf(base.megjegyzes),
    email: optionalTextOf(base.email),
    cashAccounting: booleanOf(base.penzforg),
    test: booleanOf(base.teszt),
    seller: decodeParty(root.szallito),
    customer: decodeParty(root.vevo),
    items: listOf(root.tetelek?.tetel).map(decodeLineItem),
    totals: decodeTotals(root.osszegek?.totalossz),
    vatSummary: listOf(root.osszegek?.afakulcsossz).map(decodeVatSummary),
    payments: listOf(root.kifizetesek?.kifizetes).map(decodePayment),
    response,
  }

  const pdf = optionalTextOf(root.pdf)
  if (pdf) invoice.pdf = Buffer.from(pdf, 'base64')

  return invoice
}
