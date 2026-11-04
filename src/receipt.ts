import { convert } from 'xmlbuilder2'
import type { QueriedTotals, QueriedVatSummary, Receipt, ReceiptItem, ReceiptLedger, ReceiptPayment } from './types.js'
import { booleanOf, listOf, numberOf, optionalTextOf, textOf } from './xml.js'

/**
 * Decoders for the receipt (nyugta) replies.
 *
 * Creating, reversing and querying a receipt all answer with the same
 * `<xmlnyugtavalasz>` document — unlike invoices, whose replies differ per
 * operation — so one decoder covers all three. Sending a receipt answers with
 * a bare `<xmlnyugtasendvalasz>` that only reports success.
 *
 * Errors are not handled here: every receipt reply reports a failure as
 * `<sikeres>false</sikeres>` with `<hibakod>`/`<hibauzenet>`, which `parseError`
 * already reads, so callers check that first.
 *
 * References:
 * - https://docs.szamlazz.hu/agent/generating_receipt/response
 * - https://docs.szamlazz.hu/agent/reversing_receipt/response
 * - https://docs.szamlazz.hu/agent/querying_receipt/response
 * - https://docs.szamlazz.hu/agent/sending_receipt/response
 */

/**
 * The response schema has `afakulcs` as a number and a named code in a separate
 * `afatipus`. Should a named code ever arrive in `afakulcs` itself — which is how
 * the request carries it — it is reported as the type rather than read as `0`
 * and dropped.
 */
const decodeVat = (node: any): { vatRate: number; vatType?: string } => {
  const rate = optionalTextOf(node?.afakulcs)
  const type = optionalTextOf(node?.afatipus)
  if (rate !== undefined && Number.isNaN(Number(rate))) return { vatRate: 0, vatType: type ?? rate }
  return { vatRate: numberOf(rate), vatType: type }
}

const decodeLedger = (node: any): ReceiptLedger | undefined => {
  const revenue = optionalTextOf(node?.arbevetel)
  const vat = optionalTextOf(node?.afa)
  return revenue || vat ? { revenue, vat } : undefined
}

const decodeItem = (node: any): ReceiptItem => ({
  id: optionalTextOf(node?.azonosito),
  name: textOf(node?.megnevezes) ?? '',
  amount: numberOf(node?.mennyiseg),
  amountName: textOf(node?.mennyisegiEgyseg) ?? '',
  netUnitPrice: numberOf(node?.nettoEgysegar),
  ...decodeVat(node),
  // The schema names these netto/afa/brutto, but the documented sample reply
  // also shows the invoice names nettoErtek/afaErtek/bruttoErtek, so take either.
  netAmount: numberOf(node?.netto ?? node?.nettoErtek),
  taxAmount: numberOf(node?.afa ?? node?.afaErtek),
  grossAmount: numberOf(node?.brutto ?? node?.bruttoErtek),
  ledger: decodeLedger(node?.fokonyv),
})

const decodePayment = (node: any): ReceiptPayment => ({
  method: textOf(node?.fizetoeszkoz) ?? '',
  amount: numberOf(node?.osszeg),
  description: optionalTextOf(node?.leiras),
})

const decodeTotals = (node: any): QueriedTotals => ({
  net: numberOf(node?.netto),
  tax: numberOf(node?.afa),
  gross: numberOf(node?.brutto),
})

const decodeVatSummary = (node: any): QueriedVatSummary => ({
  ...decodeTotals(node),
  ...decodeVat(node),
})

const parse = (response: string): any => {
  try {
    return convert(response, { format: 'object' })
  } catch {
    throw new Error(response)
  }
}

/**
 * Decodes an `<xmlnyugtavalasz>` reply.
 *
 * @throws {Error} carrying the raw body when it is not a successful receipt reply.
 */
export const decodeReceipt = (response: string): Receipt => {
  const root = parse(response)?.xmlnyugtavalasz
  const receipt = root?.nyugta
  if (!receipt || typeof receipt !== 'object' || textOf(root.sikeres) !== 'true') throw new Error(response)

  const base = receipt.alap ?? {}

  const decoded: Receipt = {
    id: optionalTextOf(base.id),
    callId: optionalTextOf(base.hivasAzonosito),
    number: textOf(base.nyugtaszam) ?? '',
    type: textOf(base.tipus) ?? '',
    reversed: booleanOf(base.stornozott),
    reversedReceiptNumber: optionalTextOf(base.stornozottNyugtaszam),
    issueDate: textOf(base.kelt) ?? '',
    paymentMethod: textOf(base.fizmod) ?? '',
    currency: textOf(base.penznem) ?? '',
    exchangeBank: optionalTextOf(base.devizabank),
    exchangeRate: numberOf(base.devizaarf),
    comment: optionalTextOf(base.megjegyzes),
    customerLedgerId: optionalTextOf(base.fokonyvVevo),
    test: booleanOf(base.teszt),
    orderNumber: optionalTextOf(base.rendelesSzam),
    items: listOf(receipt.tetelek?.tetel).map(decodeItem),
    payments: listOf(receipt.kifizetesek?.kifizetes).map(decodePayment),
    totals: decodeTotals(receipt.osszegek?.totalossz),
    vatSummary: listOf(receipt.osszegek?.afakulcsossz).map(decodeVatSummary),
    response,
  }

  // The PDF sits beside <nyugta>, not inside it.
  const pdf = optionalTextOf(root.nyugtaPdf)
  if (pdf) decoded.pdf = Buffer.from(pdf, 'base64')

  return decoded
}

/**
 * Checks an `<xmlnyugtasendvalasz>` reply, which carries nothing but the outcome.
 *
 * @throws {Error} carrying the raw body when it does not report success.
 */
export const assertReceiptSent = (response: string): void => {
  const root = parse(response)?.xmlnyugtasendvalasz
  if (textOf(root?.sikeres) !== 'true') throw new Error(response)
}
