// Abrir/salvar: formato próprio .alcpoint, exportar .pptx, inserir imagem.
import type { Deck } from '../../shared/deck'

const enc = new TextEncoder()
const dec = new TextDecoder()

const ALC = [{ name: 'Apresentação AlcinaPoint', extensions: ['alcpoint'] }]
const PPTX = [{ name: 'Apresentação do PowerPoint', extensions: ['pptx'] }]
const IMG = [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]

export async function saveDeck(deck: Deck, suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: ALC, defaultPath: `${suggested}.alcpoint` })
  if (!path) return null
  await window.alcinaFiles.write(path, enc.encode(JSON.stringify(deck)))
  return path
}

export async function openDeck(): Promise<{ deck: Deck; path: string } | null> {
  const path = await window.alcinaFiles.openDialog({ filters: ALC })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const deck = JSON.parse(dec.decode(bytes)) as Deck
  if (deck?.app !== 'alcina-point') throw new Error('Este arquivo não é uma apresentação AlcinaPoint.')
  return { deck, path }
}

export async function exportPptx(deck: Deck, suggested: string): Promise<string | null> {
  const path = await window.alcinaFiles.saveDialog({ filters: PPTX, defaultPath: `${suggested}.pptx` })
  if (!path) return null
  await window.alcinaPptx.build(deck, path)
  return path
}

export async function pickImage(): Promise<string | null> {
  const path = await window.alcinaFiles.openDialog({ filters: IMG })
  if (!path) return null
  const bytes = await window.alcinaFiles.read(path)
  const ext = (path.split('.').pop() ?? 'png').toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return `data:${mime};base64,${btoa(bin)}`
}

export function baseName(path: string | null): string {
  if (!path) return 'Apresentação'
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '')
}
