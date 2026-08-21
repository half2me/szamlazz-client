export enum NamedVATRate {
  TEHK = 'TEHK', // Outside the scope of Hungarian VAT
  TAHK = 'TAHK', // Not subject to VAT
  TAM = 'TAM', // supply exempt from VAT / exempt supply
  AAM = 'AAM', // person exempt from VAT / exempt person
  EUT = 'EUT', // Within EU (former 'EU')
  EUKT = 'EUKT', // Outside EU (former 'EUK')
  MAA = 'MAA', // exempt from tax
  F_AFA = 'F.AFA', // reverse VAT
  K_AFA = 'K.AFA', // differential VAT
  HO = 'HO', // Harmadik országban teljesített ügylet (TEHK)
  EUE = 'EUE', // Másik tagállamban teljesített, nem fordítottan adózó ügylet
  EUFADE = 'EUFADE', // Másik tagállamban teljesített, nem az Áfa tv. 37. §-a alá tartozó, fordítottan adózó ügylet
  EUFAD37 = 'EUFAD37', // -Áfa tv. 37. §-a alapján másik tagállamban teljesített, fordítottan adózó ügylet
  ATK = 'ATK', // ÁFA tárgyi hatályán kívüli
  NAM = 'NAM', // adómentesség egyéb nemzetközi ügyletekhez
  EAM = 'EAM', // adómentes termékexport harmadik országba
  KBAUK = 'KBAUK', // Közösségen belüli termékértékesítés UK
  KBAET = 'KBAET', // Közösségen belüli termékértékesítés ET
}

export type VATRate = 0 | 5 | 7 | 18 | 19 | 20 | 25 | 27 | NamedVATRate

export enum PaymentMethod {
  Transfer = 'átutalás',
  Cash = 'készpénz',
  Card = 'bankkártya',
}

export type Currency = 'HUF' | 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CNY' | 'CZK' | 'PLN' | 'RON'

export type LanguageCode = 'hu' | 'en' | 'de' | 'it' | 'ro' | 'sk' | 'hr' | 'fr' | 'es' | 'cz' | 'pl' | 'bg' | 'nl' | 'ru' | 'si'

export enum InvoiceTemplate {
  SzlaMost = 'SzlaMost',
  SzlaAlap = 'SzlaAlap',
  SzlaNoEnv = 'SzlaNoEnv',
  Szla8cm = 'Szla8cm',
  SzlaTomb = 'SzlaTomb',
}

export interface InvoiceOptions {
  payee?: PayeeDetails
  customer: CustomerDetails
  eInvoice: boolean
  issueDate: Date
  completionDate: Date
  dueDate: Date
  paymentMethod: PaymentMethod | string
  currency: Currency
  language: LanguageCode
  sendEmail: boolean
  comment?: string
  orderNumber?: string
  prefix?: string
  email?: EmailDetails
  previewOnly?: boolean
  template?: InvoiceTemplate
  settled?: boolean
  downloadPDF?: boolean
  externalId?: string
  /**
   * When set, the invoice is issued as a correction invoice (helyesbítő számla)
   * for the invoice with this number. This must always be the original invoice
   * number — a correction invoice itself cannot be corrected, but the same
   * original may be corrected repeatedly. The line items should contain the
   * correction deltas (typically the original items negated and the corrected
   * items added).
   */
  correctedInvoiceNumber?: string
}

export type ReverseInvoiceOptions = Pick<InvoiceOptions, 'eInvoice' | 'issueDate' | 'completionDate' | 'downloadPDF'>

export interface EmailDetails {
  replyTo?: string
  subject: string
  content: string
}

export interface PayeeDetails {
  bankName: string
  bankAccountNumber: string
}

export interface CustomerDetails {
  id?: string
  name: string
  zip: string
  country?: string
  city: string
  address: string
  email?: string
  phone?: string
  comment?: string
  taxNumber?: string
}

export interface LineItem {
  id?: string
  name: string
  amount: number
  amountName: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  netUnitPrice: number
  vatRate: VATRate
  comment?: string
}

export interface KeyAuth {
  key: string
}

export interface CredentialAuth {
  username: string
  password: string
}

export interface InvoiceItemResponse {
  invoice: HostedInvoice
  net: number
  gross: number
  receivables: number
  pdf?: Buffer
}

export interface HostedInvoice {
  number: string
  partId: string
  szfejId: string
  pdfUrl: string
  customerAccountUrl: string
}

/**
 * Which document to look up. `orderNumber` and `externalId` only find a document
 * if the same value was passed to {@link InvoiceOptions.orderNumber} or
 * {@link InvoiceOptions.externalId} when it was created; when several documents
 * share an order number, szamlazz.hu returns the most recent one.
 *
 * Exactly one identifier, and the other two typed `never` so that supplying two
 * at once is a type error rather than a silently ambiguous request.
 * {@link Client.findInvoice} enforces the same rule at runtime, for JavaScript
 * callers and for values that only take shape at runtime.
 */
export type InvoiceQuery =
  | { invoiceNumber: string; orderNumber?: never; externalId?: never }
  | { orderNumber: string; invoiceNumber?: never; externalId?: never }
  | { externalId: string; invoiceNumber?: never; orderNumber?: never }

export interface QueryOptions {
  /**
   * Include the document's PDF in the response. Off by default: it is base64-encoded
   * into the XML body, which makes an otherwise small lookup several hundred kilobytes.
   */
  pdf?: boolean
}

export interface QueriedAddress {
  country?: string
  zip?: string
  city?: string
  address?: string
}

/** The seller or the customer as they are recorded on an issued document. */
export interface QueriedParty {
  /** szamlazz.hu's own id for the party. */
  id?: string
  name: string
  address: QueriedAddress
  email?: string
  taxNumber?: string
  /** EU VAT number (`adoszameu`). Only the seller carries one. */
  euTaxNumber?: string
  bankName?: string
  bankAccountNumber?: string
}

export interface QueriedLineItem {
  name: string
  amount: number
  amountName: string
  netUnitPrice: number
  /**
   * The VAT percentage (`afakulcs`). Always numeric on a queried document, even
   * for a line issued with a named rate: those report `0` here and name
   * themselves in {@link vatType}.
   */
  vatRate: number
  /**
   * The named VAT code the line was issued with (`afatipus`), e.g. `AAM` or
   * `TAM` — one of {@link NamedVATRate} for the codes this client lists.
   * Absent on lines carrying an ordinary percentage rate. szamlazz.hu returns
   * this element without documenting it in the response reference.
   */
  vatType?: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  comment?: string
}

export interface QueriedTotals {
  net: number
  tax: number
  gross: number
}

/** One row of the per-VAT-rate breakdown (`afakulcsossz`). */
export interface QueriedVatSummary extends QueriedTotals {
  /** See {@link QueriedLineItem.vatRate}. */
  vatRate: number
  /** See {@link QueriedLineItem.vatType}. */
  vatType?: string
}

export interface QueriedPayment {
  /** `YYYY-MM-DD`, as szamlazz.hu reports it. */
  date: string
  /** Payment title (`jogcim`), e.g. `transfer`. */
  title?: string
  amount: number
  comment?: string
  bankAccountNumber?: string
}

/** A document szamlazz.hu has already issued, as returned by {@link Client.findInvoice}. */
export interface QueriedInvoice {
  /** szamlazz.hu's internal document id (`<alap><id>`). */
  id?: string
  number: string
  /** Document type letter (`<alap><tipus>`), e.g. `D` for an invoice. */
  type?: string
  eInvoice: boolean
  /**
   * Issue, completion and payment-deadline dates, as `YYYY-MM-DD` in
   * Europe/Budapest. Left as strings on purpose: szamlazz.hu sends no time and
   * no zone, so parsing them into a `Date` would invent both.
   */
  issueDate: string
  completionDate: string
  dueDate: string
  paymentMethod?: string
  currency?: string
  /** Exchange rate against HUF, `0` for a document already in HUF. */
  exchangeRate: number
  language?: string
  comment?: string
  /** The address the document was emailed to. */
  email?: string
  /** True when the document is under the cash-accounting VAT scheme (`penzforg`). */
  cashAccounting: boolean
  /** True for a document issued on a szamlazz.hu test account. */
  test: boolean
  seller: QueriedParty
  customer: QueriedParty
  items: QueriedLineItem[]
  totals: QueriedTotals
  vatSummary: QueriedVatSummary[]
  payments: QueriedPayment[]
  /** Only present when {@link QueryOptions.pdf} was set. */
  pdf?: Buffer
  /** The unmodified response body, for the fields this client does not model. */
  response: string
}
