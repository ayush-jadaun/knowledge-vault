import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath = join(__dirname, '../docs/public/og-image.svg')
const pngPath = join(__dirname, '../docs/public/og-image.png')

const svg = readFileSync(svgPath, 'utf-8')
const resvg = new Resvg(svg, { width: 1200, height: 630 })
const pngData = resvg.render()
writeFileSync(pngPath, pngData.asPng())

console.log('Generated og-image.png (1200x630)')
