/**
 * Readers for the object form xmlbuilder2 produces from a szamlazz.hu response.
 *
 * Every value in that object arrives as text, and the same element can appear as
 * a bare string, as `{ $: string }` when it is CDATA, as `{}` when it is empty
 * (`<adoszam></adoszam>`), and as an array or a single object depending on how
 * many siblings it happens to have. These readers absorb that so the decoders
 * can read a response as if it were a plain record.
 */

/** Reads an XML text node, which xmlbuilder2 represents as a string or as `{ $: string }` for CDATA. */
export const textOf = (node: unknown): string | undefined => {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (node && typeof node === 'object' && '$' in node) return textOf((node as { $: unknown }).$)
  return undefined
}

/** Like {@link textOf}, but treats an empty or whitespace-only element as absent. */
export const optionalTextOf = (node: unknown): string | undefined => {
  const text = textOf(node)?.trim()
  return text ? text : undefined
}

/** Reads a numeric element, falling back to `fallback` when it is missing or unparsable. */
export const numberOf = (node: unknown, fallback = 0): number => {
  const text = optionalTextOf(node)
  if (text === undefined) return fallback
  const value = Number(text)
  return Number.isNaN(value) ? fallback : value
}

/** Reads a boolean element. szamlazz.hu writes both `true`/`false` and `1`/`0`, depending on the field. */
export const booleanOf = (node: unknown): boolean => {
  const text = optionalTextOf(node)?.toLowerCase()
  return text === 'true' || text === '1'
}

/**
 * Reads a repeated element as an array. xmlbuilder2 collapses a single
 * occurrence to the value itself, so an invoice with one line item would
 * otherwise be shaped differently from one with two.
 */
export const listOf = (node: unknown): unknown[] => {
  if (node === undefined || node === null) return []
  return Array.isArray(node) ? node : [node]
}
