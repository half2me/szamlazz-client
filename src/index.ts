import { create } from 'xmlbuilder2'
import type { InvoiceOptions, LineItem } from './types'
import { Currency, Language, PaymentMethod, NamedVATRate } from './types'

const rootXMLAttrs = {
  '@xmlns': 'http://www.szamlazz.hu/xmlszamla',
  '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  '@xsi:schemaLocation':
    'http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd',
}

export default class Client {
  readonly key: string

  constructor(key: string) {
    this.key = key
  }

  private generateXML(content: object): string {
    const doc = create({ encoding: 'UTF-8' }, content)
    return doc.end({ prettyPrint: true })
  }

  generateInvoice(options: InvoiceOptions, items: Array<LineItem> = []): string {
    const doc = {
      xmlszamla: {
        ...rootXMLAttrs,
        beallitasok: {
          szamlaagentkulcs: this.key,
          eszamla: options.eszamla,
          szamlaLetoltes: false,
          valaszVerzio: 1,
        },
        fejlec: {
          keltDatum: options.issueDate,
          teljesitesDatum: options.completionDate,
          fizetesiHataridoDatum: options.dueDate,
          fizmod: options.paymentMethod,
          szamlaszamElotag: options.prefix,
        },
        elado: {
          bank: options.payee?.bankName,
          bankszamlaszam: options.payee?.bankAccountNumber,
          emailReplyTo: options.email?.replyTo,
          emailTargy: options.email?.subject,
          emailSzoveg: options.email?.content,
        },
        vevo: {
          sendEmail: options.sendEmail,
          nev: options.customer.name,
          orszag: options.customer.country,
          irsz: options.customer.zip,
          telepules: options.customer.city,
          cim: options.customer.address,
          email: options.customer.email,
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

    return this.generateXML(doc)
  }
}

const c = new Client('foo')

const invoiceSettings: InvoiceOptions = {
  sendEmail: false,
  eszamla: true,
  completionDate: '2022-01-01',
  dueDate: '2022-01-01',
  issueDate: '2022-01-01',
  currency: Currency.HUF,
  language: Language.HU,
  paymentMethod: PaymentMethod.Card,
  payee: {
    bankAccountNumber: '11111111-22222222-33333333',
    bankName: 'OTP Bank',
  },
  customer: {
    address: '1010 Budapest Yolo utca 1-3. 4em 6ajtó',
    city: '',
    email: 'yolo@gmail.com',
    name: 'Yolo Customer',
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
