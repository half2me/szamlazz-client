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

export type LanguageCode =
  'hu' | 'en' | 'de' | 'it' | 'ro' | 'sk' | 'hr' | 'fr' | 'es' | 'cz' | 'pl' | 'bg' | 'nl' | 'ru' | 'si'

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
}

/**
 * Options for a correction invoice (helyesbítő számla): {@link InvoiceOptions}
 * without `customer`, because a correction cannot change the partner.
 */
export type CorrectionInvoiceOptions = Omit<InvoiceOptions, 'customer'>

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

/**
 * Receipt (nyugta) VAT rate. Receipts accept every invoice rate plus `ÁKK`
 * (áfakörön kívüli) and `10`, which the receipt docs list and the invoice ones
 * do not. Both were accepted by szamlazz.hu when tested live.
 */
export type ReceiptVATRate = VATRate | 10 | 'ÁKK'

/** Receipt currency. Besides the ISO codes, receipts accept `Ft` as a synonym for HUF. */
export type ReceiptCurrency = Currency | 'Ft'

/** Built-in receipt PDF layouts (`pdfSablon`). szamlazz.hu falls back to {@link Default} for an unknown value. */
export enum ReceiptTemplate {
  /** A4 page. */
  Default = 'A',
  /** Ticket. */
  Ticket = 'J',
  /** Ticket with the account's logo. */
  TicketWithLogo = 'L',
  /** 80 mm thermal-printer width. */
  Narrow80mm = 'N',
}

/** Document type of a receipt (`<alap><tipus>`). */
export enum ReceiptType {
  /** An ordinary receipt (nyugta). */
  Receipt = 'NY',
  /** A storno receipt that reverses another one (sztornó nyugta). */
  Reversal = 'SN',
}

/** General ledger codes for a receipt line (`fokonyv`). */
export interface ReceiptLedger {
  /** Sales revenue ledger account (`arbevetel`). */
  revenue?: string
  /** VAT ledger account (`afa`). */
  vat?: string
}

/**
 * A receipt line. Same fields as an invoice {@link LineItem}, so invoice lines
 * can be reused as long as their rate is one receipts accept.
 *
 * On a HUF receipt szamlazz.hu checks the amounts strictly, without rounding:
 * `grossAmount` must be a whole number, `netAmount` and `taxAmount` may have at
 * most two decimals, and `netAmount + taxAmount` must equal `grossAmount`
 * exactly (errors 261, 363, 364, 365). Round before sending.
 */
export interface ReceiptLineItem extends Omit<LineItem, 'vatRate'> {
  vatRate: ReceiptVATRate
  ledger?: ReceiptLedger
  /** How many data erasure codes to reserve for this line (`torloKod`) — a count, not a code. */
  dataErasureCodes?: number
}

/**
 * One entry of the per-payment-method breakdown (`kifizetes`). When given, the
 * amounts must add up to the receipt's gross total (error 340 otherwise).
 */
export interface ReceiptPayment {
  /** Means of payment (`fizetoeszkoz`), free text, e.g. `bankkártya` or `SZÉP kártya`. */
  method: string
  amount: number
  /** Optional detail shown with the payment (`leiras`), e.g. the voucher issuer. */
  description?: string
}

export interface ReceiptOptions {
  /**
   * Receipt number prefix (`elotag`), e.g. `NYGTA` → `NYGTA-2026-1`. At most 5
   * uppercase letters and digits (error 337 — the length limit is not in the docs
   * but szamlazz.hu enforces it). It must not be a prefix the account uses for
   * invoices (error 336), nor one another account with the same tax number uses
   * (error 200).
   */
  prefix: string
  /** Payment method (`fizmod`), free text; the {@link PaymentMethod} values are the common ones. */
  paymentMethod: PaymentMethod | string
  currency: ReceiptCurrency
  /**
   * Exchange rate against HUF (`devizaarf`), for a receipt not in HUF. When left
   * out, szamlazz.hu fills in the day's MNB rate itself.
   */
  exchangeRate?: number
  /** The bank whose rate {@link exchangeRate} is (`devizabank`), e.g. `MNB`. */
  exchangeBank?: string
  /** Free text printed on the receipt (`megjegyzes`). */
  comment?: string
  template?: ReceiptTemplate
  /** The customer's general ledger id (`fokonyvVevo`). */
  customerLedgerId?: string
  /** Order number printed on the receipt (`rendelesSzam`). {@link Client.findReceipt} can look a receipt up by it. */
  orderNumber?: string
  /**
   * Unique id for this call (`hivasAzonosito`), which makes creating a receipt
   * idempotent: szamlazz.hu refuses a second receipt with an id it has already
   * seen, with {@link SzamlazzErrorCode.DuplicateReceiptCallId} (338), instead of
   * issuing a duplicate. Derive it from something stable on your side (a payment
   * id), not from the attempt. On a 338, fetch the existing receipt with
   * `findReceipt({ callId })`.
   */
  callId?: string
  /** Include the receipt PDF in the response (`pdfLetoltes`). */
  downloadPDF?: boolean
  /** Per-payment-method breakdown (`kifizetesek`). */
  payments?: ReceiptPayment[]
}

export interface ReverseReceiptOptions {
  /** Unique id for this call (`hivasAzonosito`). See {@link ReceiptOptions.callId}. */
  callId?: string
  /** Include the storno receipt's PDF in the response (`pdfLetoltes`). */
  downloadPDF?: boolean
  template?: ReceiptTemplate
}

/**
 * Which receipt to look up: by receipt number, or by the {@link ReceiptOptions.orderNumber}
 * or {@link ReceiptOptions.callId} it was created with. Exactly one, enforced at runtime
 * too — see {@link InvoiceQuery}. (szamlazz.hu itself would match a receipt against every
 * selector given, but one is always enough.)
 *
 * Looking up by `callId` is not described in the docs, but the schema accepts it and
 * szamlazz.hu answers it when tested live.
 */
export type ReceiptQuery =
  | { receiptNumber: string; orderNumber?: never; callId?: never }
  | { orderNumber: string; receiptNumber?: never; callId?: never }
  | { callId: string; receiptNumber?: never; orderNumber?: never }

export interface ReceiptQueryOptions extends QueryOptions {
  /** PDF layout to render {@link QueryOptions.pdf} with. */
  template?: ReceiptTemplate
}

/**
 * Email settings for {@link Client.sendReceipt}. With none of them set, szamlazz.hu
 * resends the receipt's previous notification, and fails with code 7 if there was none.
 */
export interface ReceiptEmail {
  /** Recipient address (`email`). */
  to?: string
  /** Reply-to address (`emailReplyto`). */
  replyTo?: string
  /** Subject line (`emailTargy`). */
  subject?: string
  /** Body text (`emailSzoveg`). */
  content?: string
}

/** A line of an issued receipt, as szamlazz.hu reports it back. */
export interface ReceiptItem {
  id?: string
  name: string
  amount: number
  amountName: string
  netUnitPrice: number
  /** The VAT percentage. A line with a named rate reports `0` here and names it in {@link vatType}. */
  vatRate: number
  /** The named VAT code (`afatipus`), e.g. `AAM` or `ÁKK`. Absent for an ordinary percentage rate. */
  vatType?: string
  netAmount: number
  taxAmount: number
  grossAmount: number
  ledger?: ReceiptLedger
}

/**
 * A receipt as szamlazz.hu reports it: the reply to {@link Client.createReceipt},
 * {@link Client.reverseReceipt} (where it describes the new storno receipt, not
 * the reversed one) and {@link Client.findReceipt}.
 */
export interface Receipt {
  /** szamlazz.hu's internal document id. */
  id?: string
  /** The {@link ReceiptOptions.callId} the receipt was created with, if any. */
  callId?: string
  number: string
  /** {@link ReceiptType.Receipt} or {@link ReceiptType.Reversal}. */
  type: ReceiptType | string
  /**
   * `stornozott`. True on a receipt that has been reversed — and also on the storno
   * receipt itself, so check {@link type} to tell the two apart.
   */
  reversed: boolean
  /**
   * On a storno receipt, the number of the receipt it reverses. szamlazz.hu does
   * not report the opposite link: a reversed receipt does not name its storno.
   */
  reversedReceiptNumber?: string
  /** `YYYY-MM-DD`, as szamlazz.hu reports it. Left a string for the same reason as {@link QueriedInvoice.issueDate}. */
  issueDate: string
  paymentMethod: string
  currency: string
  exchangeBank?: string
  /** `0` when not reported. */
  exchangeRate: number
  comment?: string
  customerLedgerId?: string
  /** True for a receipt issued on a szamlazz.hu test account. */
  test: boolean
  orderNumber?: string
  items: ReceiptItem[]
  payments: ReceiptPayment[]
  totals: QueriedTotals
  vatSummary: QueriedVatSummary[]
  /** Only present when the PDF was requested. */
  pdf?: Buffer
  /** The unmodified response body. */
  response: string
}
