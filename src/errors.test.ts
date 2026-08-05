import { describe, it, expect } from 'vitest'
import {
  errorCategory,
  isKnownErrorCode,
  isSzamlazzError,
  parseError,
  SzamlazzError,
  SzamlazzErrorCategory,
  SzamlazzErrorCode,
} from './errors.js'

/** Real response bodies captured from https://www.szamlazz.hu/szamla/ */
const xmlError = (code: number, message: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamlavalasz xmlns="http://www.szamlazz.hu/xmlszamlavalasz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<sikeres>false</sikeres>
<hibakod><![CDATA[${code}]]></hibakod>
<hibauzenet><![CDATA[${message}]]></hibauzenet>
</xmlszamlavalasz>`

const successXml = `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamlavalasz xmlns="http://www.szamlazz.hu/xmlszamlavalasz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<sikeres>true</sikeres>
<szamlaszam>E-TEST-1</szamlaszam>
<szamlanetto>7500</szamlanetto>
<szamlabrutto>8580</szamlabrutto>
<kintlevoseg>0</kintlevoseg>
<vevoifiokurl><![CDATA[https://www.szamlazz.hu/szamla/megtekintes?partguid=abc&szfejguid=def&page=1]]></vevoifiokurl>
</xmlszamlavalasz>`

describe('parseError', () => {
  it('parses the CDATA wrapped hibakod and hibauzenet', () => {
    const error = parseError(
      xmlError(7, 'Hiányzó adat: számla xml (ismeretlen számlaszám, rendelésszám vagy külső azonosító).'),
    )

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error!.code).toBe(SzamlazzErrorCode.MissingData)
    expect(error!.category).toBe(SzamlazzErrorCategory.Validation)
    expect(error!.message).toContain('ismeretlen számlaszám')
  })

  it('classifies a rejected login as an authentication error', () => {
    const error = parseError(xmlError(3, 'Sikertelen bejelentkezés.'))

    expect(error!.code).toBe(SzamlazzErrorCode.LoginFailed)
    expect(error!.category).toBe(SzamlazzErrorCategory.Authentication)
  })

  it('classifies an unpaid subscription as an account error', () => {
    const error = parseError(xmlError(136, 'Bejelentkezési hiba ...'))

    expect(error!.code).toBe(SzamlazzErrorCode.SubscriptionProblem)
    expect(error!.category).toBe(SzamlazzErrorCategory.Account)
  })

  it('keeps undocumented codes usable', () => {
    const error = parseError(xmlError(222, 'a helyesbítő számla által hivatkozott számla nem helyesbíthető'))

    expect(error!.code).toBe(222)
    expect(error!.category).toBe(SzamlazzErrorCategory.Unknown)
    expect(isKnownErrorCode(222)).toBe(false)
  })

  it('reads the szlahu_error_code header when the body is not XML', () => {
    const headers = new Headers({
      szlahu_error_code: '259',
      szlahu_error: 'A+t%C3%A9tel+nett%C3%B3+%C3%A9rt%C3%A9ke+nem+megfelel%C5%91.+Term%C3%A9k%3A+Bad+item.',
    })

    const error = parseError('%PDF-1.4 not xml at all', headers)

    expect(error!.code).toBe(SzamlazzErrorCode.ItemNetValueMismatch)
    expect(error!.message).toBe('A tétel nettó értéke nem megfelelő. Termék: Bad item.')
  })

  it('prefers the XML body over the truncated header message', () => {
    const body = xmlError(259, 'A tétel nettó értéke nem megfelelő; nettó érték = nettó egységár x mennyiség.')
    const headers = new Headers({ szlahu_error_code: '259', szlahu_error: 'A+t%C3%A9tel+nett%C3%B3.' })

    expect(parseError(body, headers)!.message).toContain('nettó egységár x mennyiség')
  })

  const plainTextBody = [
    '[ERR] Számla mentés sikertelen. Már létező rendelésszám: XX. ---------- t.getMessage(): Már létező',
    'rendelésszám: XX. ---------- [CEG:978] [MODUL:SZAMLAZZGUI]',
    'hu.kboss.szamlazz.api.bean.SzFej.insert(SzFej.java:1700)',
  ].join('\n')

  it('parses the plain-text [ERR] format used by valaszVerzio=1', () => {
    const error = parseError(plainTextBody)

    expect(error!.message).toBe('Számla mentés sikertelen. Már létező rendelésszám: XX.')
    expect(error!.code).toBe(0)
    expect(error!.category).toBe(SzamlazzErrorCategory.Unknown)
  })

  it('takes the code from the header when the plain-text body has none', () => {
    const error = parseError(plainTextBody, new Headers({ szlahu_error_code: '152' }))

    expect(error!.code).toBe(SzamlazzErrorCode.DuplicateOrderNumberWithValue)
    expect(error!.category).toBe(SzamlazzErrorCategory.Validation)
    // The body message is kept — the header one is truncated to a single sentence.
    expect(error!.message).toBe('Számla mentés sikertelen. Már létező rendelésszám: XX.')
  })

  it('returns undefined for a successful response', () => {
    expect(parseError(successXml, new Headers({ szlahu_szamlaszam: 'E-TEST-1' }))).toBeUndefined()
  })

  it('returns undefined for a non-XML success body', () => {
    expect(parseError('xmlagentresponse=DONE;E-TEST-1')).toBeUndefined()
  })

  it('keeps the raw response for inspection', () => {
    const body = xmlError(57, 'XML beolvasási hiba.')
    expect(parseError(body)!.response).toBe(body)
  })
})

describe('helpers', () => {
  it('narrows caught values', () => {
    expect(isSzamlazzError(new SzamlazzError(3, 'nope', ''))).toBe(true)
    expect(isSzamlazzError(new Error('nope'))).toBe(false)
  })

  it('reports Unknown for codes szamlazz.hu does not document', () => {
    expect(errorCategory(SzamlazzErrorCode.SystemMaintenance)).toBe(SzamlazzErrorCategory.Service)
    expect(errorCategory(9999)).toBe(SzamlazzErrorCategory.Unknown)
  })
})
