import { create, convert } from 'xmlbuilder2'
import type {
  InvoiceOptions,
  InvoiceQuery,
  LineItem,
  QueriedInvoice,
  QueryOptions,
  ReverseInvoiceOptions,
  KeyAuth,
  CredentialAuth,
  InvoiceItemResponse,
} from './types.js'
import { isSzamlazzError, parseError, SzamlazzErrorCategory, SzamlazzErrorCode } from './errors.js'
import { decodeQueriedInvoice } from './query.js'
import { URL } from 'url'

const toDateStr = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Budapest' })

/** Raw Számla Agent reply. Errors can arrive in the body, in the headers, or in both. */
interface AgentResponse {
  body: string
  headers: Headers
}

const QUERY_IDENTIFIERS = ['invoiceNumber', 'orderNumber', 'externalId'] as const

/**
 * Rejects a lookup that names no document, or more than one.
 *
 * This has to be checked rather than left to the type, because getting it wrong
 * fails in the worst possible direction: szamlazz.hu answers a request with no
 * usable selector with code 7, the very code {@link Client.findInvoice} reads as
 * "no such document". An empty or ambiguous query would therefore come back as a
 * confident `null` — and a caller looking a document up to avoid issuing a
 * duplicate would take that as permission to issue one.
 *
 * @throws {TypeError} which is deliberately not a `SzamlazzError`: nothing was sent, and the caller's own code is what needs fixing.
 */
const assertOneIdentifier = (query: InvoiceQuery): void => {
  const named = QUERY_IDENTIFIERS.filter((key) => query[key] !== undefined && query[key] !== null)

  if (named.length !== 1) {
    throw new TypeError(
      `findInvoice needs exactly one of ${QUERY_IDENTIFIERS.join(', ')}, ` +
        (named.length ? `but was given ${named.join(' and ')}` : 'but was given none'),
    )
  }

  const [key] = named
  const value = query[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`findInvoice was given an empty ${key}`)
  }
}

export class Client {
  readonly key?: string
  readonly username?: string
  readonly password?: string

  readonly apiUrl = 'https://www.szamlazz.hu/szamla/'

  constructor(auth: KeyAuth | CredentialAuth) {
    this.key = (<KeyAuth>auth).key
    this.username = (<CredentialAuth>auth).username
    this.password = (<CredentialAuth>auth).password
  }

  /**
   * @throws {SzamlazzError} when szamlazz.hu reported an error code, so callers can
   *   branch on {@link SzamlazzError.code} / {@link SzamlazzError.category}.
   */
  private decodeResponse({ body, headers }: AgentResponse): InvoiceItemResponse {
    const error = parseError(body, headers)
    if (error) throw error

    // Decode Response
    try {
      const obj: any = convert(body, { format: 'object' })

      // Decode hosted url params:
      const url = new URL(obj.xmlszamlavalasz?.vevoifiokurl?.$)
      const pdfUrl = new URL(obj.xmlszamlavalasz?.vevoifiokurl?.$)
      pdfUrl.searchParams.append('action', 'szamlapdf')
      pdfUrl.searchParams.delete('page')

      const decoded: InvoiceItemResponse = {
        invoice: {
          number: obj.xmlszamlavalasz?.szamlaszam,
          customerAccountUrl: obj.xmlszamlavalasz?.vevoifiokurl?.$,
          partId: url.searchParams.get('partguid')!,
          szfejId: url.searchParams.get('szfejguid')!,
          pdfUrl: pdfUrl.href,
        },
        net: Number(obj.xmlszamlavalasz?.szamlanetto),
        gross: Number(obj.xmlszamlavalasz?.szamlabrutto),
        receivables: Number(obj.xmlszamlavalasz?.kintlevoseg),
      }

      if (obj.xmlszamlavalasz?.pdf) {
        decoded.pdf = Buffer.from(obj.xmlszamlavalasz?.pdf, 'base64')
      }

      return decoded
    } catch (e) {
      throw new Error(body)
    }
  }

  private async sendRequest(type: string, content: object): Promise<AgentResponse> {
    // Build XML
    const doc = create({ encoding: 'UTF-8' }, content)
    const xml = doc.end({ prettyPrint: false })

    // Build Request
    const form = new FormData()
    form.append(type, new Blob([xml], { type: 'application/xml' }), type)

    // Send Request
    const response = await fetch(this.apiUrl, { method: 'POST', body: form })
    return { body: await response.text(), headers: response.headers }
  }

  private authAttributes() {
    return {
      szamlaagentkulcs: this.key,
      felhasznalo: this.username,
      jelszo: this.password,
    }
  }

  async generateInvoice(options: InvoiceOptions, items: Array<LineItem> = []) {
    const doc = {
      xmlszamla: {
        '@xmlns': 'http://www.szamlazz.hu/xmlszamla',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@xsi:schemaLocation':
          'http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd',
        beallitasok: {
          ...this.authAttributes(),
          eszamla: options.eInvoice,
          szamlaLetoltes: options.downloadPDF ?? false,
          valaszVerzio: 2,
          szamlaKulsoAzon: options.externalId,
        },
        fejlec: {
          keltDatum: toDateStr(options.issueDate),
          teljesitesDatum: toDateStr(options.completionDate),
          fizetesiHataridoDatum: toDateStr(options.dueDate),
          fizmod: options.paymentMethod,
          penznem: options.currency,
          szamlaNyelve: options.language,
          megjegyzes: options.comment,
          szamlaszamElotag: options.prefix,
          rendelesSzam: options.orderNumber,
          helyesbitoszamla: options.correctedInvoiceNumber ? true : undefined,
          helyesbitettSzamlaszam: options.correctedInvoiceNumber,
          fizetve: options.settled,
          elonezetpdf: options.previewOnly,
          szamlaSablon: options.template,
        },
        elado: {
          bank: options.payee?.bankName,
          bankszamlaszam: options.payee?.bankAccountNumber,
          emailReplyto: options.email?.replyTo,
          emailTargy: options.email?.subject,
          emailSzoveg: options.email?.content,
        },
        vevo: {
          nev: options.customer.name,
          orszag: options.customer.country,
          irsz: options.customer.zip,
          telepules: options.customer.city,
          cim: options.customer.address,
          email: options.customer.email,
          sendEmail: options.sendEmail,
          adoszam: options.customer.taxNumber,
          azonosito: options.customer.id,
          telefonszam: options.customer.phone,
          megjegyzes: options.customer.comment,
        },
        tetelek: {
          tetel: items.map((i) => ({
            megnevezes: i.name,
            azonosito: i.id,
            mennyiseg: i.amount,
            mennyisegiEgyseg: i.amountName,
            nettoEgysegar: i.netUnitPrice,
            afakulcs: i.vatRate,
            nettoErtek: i.netAmount,
            afaErtek: i.taxAmount,
            bruttoErtek: i.grossAmount,
            megjegyzes: i.comment,
          })),
        },
      },
    }
    return this.decodeResponse(await this.sendRequest('action-xmlagentxmlfile', doc))
  }

  /**
   * Creates a correction invoice (helyesbítő számla) for an existing invoice.
   *
   * Unlike a reversal/storno, the original invoice stays valid; the original
   * and the correction invoice are valid together. The `items` must describe
   * the correction deltas — typically the original line items with negated
   * amounts, followed by the corrected line items. Partner details, payment
   * method and currency cannot be changed by a correction invoice.
   *
   * Each call produces a brand-new invoice with its own number — nothing is
   * edited in place — and that number is returned in the response.
   *
   * `invoice` must always be the ORIGINAL invoice number, even when applying
   * several corrections. A correction invoice is not itself correctable: the
   * API rejects an attempt to correct a correction (error 222, "a helyesbítő
   * számla által hivatkozott számla nem helyesbíthető"). The same original may
   * be corrected repeatedly, and the original plus all of its corrections are
   * jointly valid:
   *
   * ```ts
   * const inv = await client.generateInvoice(opts, items)          // E-001
   * const c1  = await client.correctInvoice(inv.invoice.number, opts, deltas) // → E-002, refs E-001
   * const c2  = await client.correctInvoice(inv.invoice.number, opts, more)   // → E-003, refs E-001
   * ```
   *
   * To "reverse" a corrected invoice, issue one more correction (again against
   * the original) whose deltas negate the current net state — storno via
   * {@link reverseInvoice} is not allowed once an invoice has been corrected.
   *
   * @param invoice The number of the ORIGINAL invoice being corrected — never a
   *   previous correction invoice.
   */
  async correctInvoice(invoice: string, options: InvoiceOptions, items: Array<LineItem> = []) {
    return this.generateInvoice({ ...options, correctedInvoiceNumber: invoice }, items)
  }

  /**
   * Creates a reversal/storno invoice that fully voids an existing invoice.
   *
   * Note: an invoice that has already been corrected — and any correction
   * invoice in its chain — cannot be stornoed; szamlazz.hu rejects the request.
   * Use {@link correctInvoice} with negated deltas to undo a correction instead.
   */
  async reverseInvoice(invoice: string, options: ReverseInvoiceOptions) {
    const doc = {
      xmlszamlast: {
        '@xmlns': 'http://www.szamlazz.hu/xmlszamlast',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@xsi:schemaLocation':
          'http://www.szamlazz.hu/xmlszamlast https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamlast.xsd',
        beallitasok: {
          ...this.authAttributes(),
          eszamla: options.eInvoice,
          szamlaLetoltes: options.downloadPDF ?? false,
          valaszVerzio: 2,
        },
        fejlec: {
          szamlaszam: invoice,
          keltDatum: toDateStr(options.issueDate),
          teljesitesDatum: toDateStr(options.completionDate),
        },
      },
    }

    return this.decodeResponse(await this.sendRequest('action-szamla_agent_st', doc))
  }

  /**
   * Validates the credentials by querying an invoice number that cannot exist.
   *
   * Returns `true` when szamlazz.hu accepted the credentials (it answers with
   * {@link SzamlazzErrorCode.MissingData} because the invoice is not found) and
   * `false` when it rejected them.
   *
   * Anything else — an unpaid subscription ({@link SzamlazzErrorCode.SubscriptionProblem}),
   * maintenance, a blocked account — is thrown as a {@link SzamlazzError} rather
   * than reported as bad credentials, since those need a different response from
   * the caller.
   *
   * @throws {SzamlazzError} when the request failed for a reason unrelated to the credentials.
   */
  async testConnection(): Promise<boolean> {
    try {
      // A `null` result means szamlazz.hu looked the invoice up and did not find
      // it, which it can only do once it has accepted the credentials.
      await this.findInvoice({ invoiceNumber: 'NEMLETEZIKSOHANEMISFOG' })
      return true
    } catch (e) {
      if (isSzamlazzError(e) && e.category === SzamlazzErrorCategory.Authentication) return false
      throw e
    }
  }

  /**
   * Looks up a document szamlazz.hu has already issued.
   *
   * Identify it by its invoice number, by the `orderNumber` given to
   * {@link generateInvoice}, or by the `externalId` — the latter two only find
   * the document if they were set when it was created. Where several documents
   * share an order number, szamlazz.hu returns the most recent one.
   *
   * **Returns `null` when no such document exists** instead of throwing.
   * szamlazz.hu reports a missing document with
   * {@link SzamlazzErrorCode.MissingData}, the same code it uses for a request
   * that left out a required field, and this client is the only layer that
   * knows a lookup was what it sent — so callers would otherwise all have to
   * special-case code 7 to ask a question whose negative answer is not an
   * error. Every other failure still throws.
   *
   * The response carries no link to the document: the customer-account URL that
   * {@link generateInvoice} derives `pdfUrl` from is only handed out when the
   * document is created. Pass `{ pdf: true }` to get the PDF bytes inline instead.
   *
   * Only documents issued through szamlazz.hu itself can be retrieved this way.
   *
   * @throws {SzamlazzError} when the request failed for any reason other than the document not existing.
   * @throws {TypeError} when `query` names no document or more than one — that would otherwise
   *   come back from szamlazz.hu as code 7 and be reported as a confident "not found".
   */
  async findInvoice(query: InvoiceQuery, options: QueryOptions = {}): Promise<QueriedInvoice | null> {
    assertOneIdentifier(query)

    const doc = {
      xmlszamlaxml: {
        '@xmlns': 'http://www.szamlazz.hu/xmlszamlaxml',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@xsi:schemaLocation':
          'http://www.szamlazz.hu/xmlszamlaxml https://www.szamlazz.hu/szamla/docs/xsds/agentxml/xmlszamlaxml.xsd',
        ...this.authAttributes(),
        szamlaszam: query.invoiceNumber,
        rendelesSzam: query.orderNumber,
        pdf: options.pdf ?? false,
        szamlaKulsoAzon: query.externalId,
      },
    }

    const { body, headers } = await this.sendRequest('action-szamla_agent_xml', doc)
    const error = parseError(body, headers)

    if (error) {
      if (error.code === SzamlazzErrorCode.MissingData) return null
      throw error
    }

    return decodeQueriedInvoice(body)
  }
}

export default Client
export * from './types.js'
export * from './errors.js'
