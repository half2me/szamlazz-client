import { create } from 'xmlbuilder2'
import type { InvoiceOptions, LineItem, ReverseInvoiceOptions, KeyAuth, CredentialAuth } from './types'
import { Currency, Language, PaymentMethod, NamedVATRate } from './types'
import fetch from 'node-fetch'
import FormData from 'form-data'

const rootXMLAttrs = {
  '@xmlns': 'http://www.szamlazz.hu/xmlszamla',
  '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  '@xsi:schemaLocation':
    'http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd',
}

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

  private generateXML(content: object): string {
    const doc = create({ encoding: 'UTF-8' }, content)
    return doc.end({ prettyPrint: true })
  }

  private async sendRequest(xml: string) {
    const form = new FormData()
    form.append('action-xmlagentxmlfile', xml, 'action-xmlagentxmlfile')

    const response = await fetch(this.apiUrl, { method: 'POST', body: form })
    const result = await response.text()
    console.log(result)
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
        ...rootXMLAttrs,
        beallitasok: {
          ...this.authAttributes(),
          eszamla: options.eInvoice,
          szamlaLetoltes: false,
          valaszVerzio: 1,
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
        tetelek: items.map((i) => ({
          tetel: {
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
          },
        })),
      },
    }
    const xml = this.generateXML(doc)
    console.log(xml)
    await this.sendRequest(xml)
  }

  reverseInvoice(invoice: string, options: ReverseInvoiceOptions): string {
    const doc = {
      xmlszamlast: {
        ...rootXMLAttrs,
        beallitasok: {
          ...this.authAttributes(),
          eszamla: options.eInvoice,
          szamlaLetoltes: false,
          valaszVerzio: 1,
        },
        fejlec: {
          szamlaszam: invoice,
          keltDatum: options.issueDate,
          teljesitesDatum: options.completionDate,
        },
      },
    }

    return this.generateXML(doc)
  }
}

const c = new Client({ username: 'demo', password: 'demo' })

const invoiceSettings: InvoiceOptions = {
  sendEmail: false,
  eInvoice: true,
  completionDate: '2021-07-20',
  dueDate: '2021-07-20',
  issueDate: '2021-07-20',
  currency: Currency.HUF,
  language: Language.EN,
  paymentMethod: PaymentMethod.Card,
  customer: {
    address: '1010 Budapest Yolo utca 1-3. 4em 6ajtó',
    city: 'Budapest',
    email: 'yolo@gmail.com',
    name: 'Yolo Customer',
    zip: '1111',
  },
}

console.log(
  c.generateInvoice(invoiceSettings, [
    {
      name: 'test item',
      amount: 1,
      amountName: 'pcs',
      netAmount: 1000,
      grossAmount: 1000,
      taxAmount: 0,
      netUnitPrice: 1000,
      vatRate: NamedVATRate.AAM,
      comment: 'yolo',
    },
  ]),
)
