import DOMPurify from 'isomorphic-dompurify'

// Apenas um subconjunto pequeno e seguro de HTML. scripts, iframes, eventos
// on*, style e qualquer coisa que execute código são removidos pelo dompurify.
// Usado antes de renderizar conteúdo gerado pelo usuário (ex.: v-html) —
// textos simples continuam indo por {{ }} (escapado pelo Vue); esta função só
// é necessária quando o HTML do servidor precisa ser injetado.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target'],
    FORCE_BODY: false,
  })
}
