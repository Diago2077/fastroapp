// Genera el logo SVG y los PNG de iconos de la PWA. Se corre a mano cuando
// el logo cambia (no es parte del build normal):
//
//   npm install --no-save sharp
//   npm run iconos
//
// Para rebrandear una app hecha sobre esta base: cambiar `colorPrimario` en
// app.config.json (de donde sale tambien el theme-color de index.html y del
// manifest, asi que no se pueden desincronizar), el GLYPH de aca, y volver a
// correrlo.
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const { colorPrimario: PRIMARY } = JSON.parse(readFileSync('app.config.json', 'utf-8'))

// glyph: tres barras apiladas, de la mas ancha abajo a la mas angosta
// arriba. Coordenadas pensadas para un viewBox de 100x100, con el contenido
// dentro del 80% central para respetar el "safe zone" de los iconos maskable.
const GLYPH = `
  <rect x="24" y="58" width="52" height="10" rx="5" fill="#ffffff"/>
  <rect x="28" y="44" width="44" height="10" rx="5" fill="#ffffff" opacity="0.85"/>
  <rect x="32" y="30" width="36" height="10" rx="5" fill="#ffffff" opacity="0.7"/>
`.trim()

function svg({ rounded }) {
  const bg = rounded
    ? `<rect width="100" height="100" rx="22" fill="${PRIMARY}"/>`
    : `<rect width="100" height="100" fill="${PRIMARY}"/>`
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${bg}${GLYPH}</svg>`
}

const SVG_ROUNDED = svg({ rounded: true })
// El maskable se recorta con la forma que quiera cada sistema operativo:
// va sin esquinas redondeadas propias para que no queden dos curvas.
const SVG_SQUARE = svg({ rounded: false })

mkdirSync('public/icons', { recursive: true })

writeFileSync('public/logo.svg', SVG_ROUNDED)
writeFileSync('public/favicon.svg', SVG_ROUNDED)

const trabajos = [
  { svg: SVG_ROUNDED, size: 32, out: 'public/favicon-32.png' },
  { svg: SVG_ROUNDED, size: 180, out: 'public/icons/apple-touch-icon.png' },
  { svg: SVG_ROUNDED, size: 192, out: 'public/icons/icon-192.png' },
  { svg: SVG_ROUNDED, size: 512, out: 'public/icons/icon-512.png' },
  { svg: SVG_SQUARE, size: 512, out: 'public/icons/icon-512-maskable.png' },
]

for (const t of trabajos) {
  await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toFile(t.out)
  console.log('OK', t.out)
}
