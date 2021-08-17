import { create, convert } from 'xmlbuilder2'
import type {
  InvoiceOptions,
  LineItem,
  ReverseInvoiceOptions,
  KeyAuth,
  CredentialAuth,
  InvoiceCreationResponse,
} from './types'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { URL } from 'url'

export default class Client {
  readonly key?: string
  readonly username?: string
  readonly password?: string

  readonly apiUrl = 'https://www.szamlazz.hu/szamla/'

  constructor(auth: KeyAuth | CredentialAuth) {
    this.key = (<KeyAuth>auth).key
    this.username = (<CredentialAuth>auth).username
    this.password = (<CredentialAuth>auth).password
  }

  private async sendRequest(type: string, content: object): Promise<InvoiceCreationResponse> {
    // Build XML
    const doc = create({ encoding: 'UTF-8' }, content)
    const xml = doc.end({ prettyPrint: false })

    // Build Request
    const form = new FormData()
    form.append(type, xml, type)

    // Send Request
    const response = await fetch(this.apiUrl, { method: 'POST', body: form })
    const result = await response.text()

    // Decode Response
    try {
      const obj: any = convert(result, { format: 'object' })

      // Decode hosted url params:
      const url = new URL(obj.xmlszamlavalasz?.vevoifiokurl?.$)
      const pdfUrl = new URL(obj.xmlszamlavalasz?.vevoifiokurl?.$)
      pdfUrl.searchParams.append('action', 'szamlapdf')
      pdfUrl.searchParams.delete('page')

      const decoded: InvoiceCreationResponse = {
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
      throw new Error(result)
    }
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
        },
        fejlec: {
          keltDatum: options.issueDate,
          teljesitesDatum: options.completionDate,
          fizetesiHataridoDatum: options.dueDate,
          fizmod: options.paymentMethod,
          penznem: options.currency,
          szamlaNyelve: options.language,
          megjegyzes: options.comment,
          szamlaszamElotag: options.prefix,
          rendelesSzam: options.orderNumber,
          fizetve: options.settled,
          elonezetpdf: options.previewOnly,
          szamlaSablon: options.template,
        },
        elado: {
          bank: options.payee?.bankName,
          bankszamlaszam: options.payee?.bankAccountNumber,
          emailReplyTo: options.email?.replyTo,
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
    return await this.sendRequest('action-xmlagentxmlfile', doc)
  }

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
          keltDatum: options.issueDate,
          teljesitesDatum: options.completionDate,
        },
      },
    }

    return await this.sendRequest('action-szamla_agent_st', doc)
  }
}
