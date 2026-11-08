import fs from 'node:fs'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

const input = 'app/assets/css/main.css'
const output = 'app/assets/css/tailwind.css'

const css = fs.readFileSync(input, 'utf8')

postcss([tailwindcss])
  .process(css, { from: input })
  .then((result) => {
    fs.mkdirSync('app/assets/css', { recursive: true })
    fs.writeFileSync(output, result.css)
    console.log(`Generated ${output} (${result.css.length} bytes)`)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
