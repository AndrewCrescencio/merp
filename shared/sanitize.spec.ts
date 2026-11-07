import { expect, test } from 'vitest'
import { sanitizeHtml } from './sanitize'

test('remove script e eventos on* (XSS)', () => {
  expect(sanitizeHtml('<b>oi</b> <script>alert(1)</script>')).toBe('<b>oi</b> ')
  // img não está na lista de tags permitidas → removido por completo
  expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('')
  expect(sanitizeHtml('<a href="https://x.com" onclick="alert(1)">link</a>')).toBe(
    '<a href="https://x.com">link</a>',
  )
})

test('mantém tags seguras e remove atributos perigosos', () => {
  expect(sanitizeHtml('<strong>negrito</strong> <em>itálico</em>')).toBe(
    '<strong>negrito</strong> <em>itálico</em>',
  )
  expect(sanitizeHtml('<p style="color:red">texto</p>')).toBe('<p>texto</p>')
})

test('string vazia retorna vazio', () => {
  expect(sanitizeHtml('')).toBe('')
})
