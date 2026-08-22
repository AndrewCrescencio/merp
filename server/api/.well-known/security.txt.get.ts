import { defineEventHandler, setResponseHeaders } from 'h3'

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  })

  const domain = process.env.BETTER_AUTH_URL?.replace(/^https?:\/\//, '') || 'app.merp.com.br'

  return `Contact: mailto:security@${domain}
Contact: https://${domain}/security-contact
Preferred-Languages: en, pt-BR
Canonical: https://${domain}/.well-known/security.txt
Policy: https://${domain}/security-policy
Hiring: https://${domain}/careers
Acknowledgments: https://${domain}/hall-of-fame
`
})
