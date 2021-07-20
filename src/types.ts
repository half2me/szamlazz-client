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

export enum Currency {
  HUF = 'HUF',
}

export enum Language {
  HU = 'hu',
  EN = 'en',
  DE = 'de',
  IT = 'it',
  RO = 'ro',
  SK = 'sk',
  HR = 'hr',
  FR = 'fr',
  ES = 'es',
  CZ = 'cz',
  PL = 'pl',
}

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
  issueDate: string
  completionDate: string
  dueDate: string
  paymentMethod: PaymentMethod
  currency: Currency
  language: Language
  sendEmail: boolean
  comment?: string
  orderNumber?: string
  prefix?: string
  email?: EmailDetails
  previewOnly?: boolean
  template?: InvoiceTemplate
  settled?: boolean
  downloadPDF?: boolean
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
  zip?: string
  country?: string
  city?: string
  address: string
  email?: string
  phone?: string
  comment?: string
  taxNumber?: string
}

export interface LineItem {
  id?: string
  name: string
  amount: Number
  amountName: string
  netAmount: Number
  taxAmount: Number
  grossAmount: Number
  netUnitPrice: Number
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

export interface InvoiceCreationResponse {
  success: boolean
  invoice: string
  net: number
  gross: number
  receivables: number
  url: string
}
