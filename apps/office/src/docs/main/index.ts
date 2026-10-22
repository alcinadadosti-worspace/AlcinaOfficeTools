// IPC específico de Documentos: conversão .docx (ler/gravar).
// (Diálogos, E/S de arquivo e impressão em PDF ficam no IPC compartilhado — ver main/common.ts.)
import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, LevelFormat, BorderStyle } from 'docx'
import type { DocBlock, DocRun } from '@alcina/editor/docmodel'

// --- Conversão para .docx ---
function alignOf(a?: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (a === 'center') return AlignmentType.CENTER
  if (a === 'right') return AlignmentType.RIGHT
  if (a === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}
function headingOf(n: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  return n === 1 ? HeadingLevel.HEADING_1 : n === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
}
// Lê as dimensões (px) de um PNG/JPEG/GIF a partir dos bytes; null se não reconhecer.
function sniffSize(buf: Buffer, mime: string): { w: number; h: number } | null {
  try {
    if (mime.includes('png')) {
      if (buf.length >= 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    } else if (mime.includes('gif')) {
      if (buf.length >= 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
    } else if (mime.includes('jpeg') || mime.includes('jpg')) {
      let o = 2
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) { o++; continue }
        const marker = buf[o + 1]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) }
        }
        o += 2 + buf.readUInt16BE(o + 2)
      }
    }
  } catch {
    /* ignora */
  }
  return null
}

// Cria um ImageRun a partir de um data: URI; null se não for imagem suportada (nunca lança).
function imageRun(src: string): ImageRun | null {
  try {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(src)
    if (!m) return null
    const mime = m[1].toLowerCase()
    const type = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('gif') ? 'gif' : mime.includes('bmp') ? 'bmp' : null
    if (!type) return null
    const buf = Buffer.from(m[2], 'base64')
    const dim = sniffSize(buf, mime) ?? { w: 480, h: 320 }
    const maxW = 480
    const scale = dim.w > maxW ? maxW / dim.w : 1
    return new ImageRun({ data: buf, type, transformation: { width: Math.max(1, Math.round(dim.w * scale)), height: Math.max(1, Math.round(dim.h * scale)) } })
  } catch {
    return null
  }
}

function runsOf(rs: DocRun[]): (TextRun | ImageRun)[] {
  const out: (TextRun | ImageRun)[] = []
  for (const r of rs) {
    if (r.image) {
      const img = imageRun(r.image.src)
      if (img) out.push(img)
      continue
    }
    out.push(new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, break: r.break ? 1 : undefined }))
  }
  return out.length ? out : [new TextRun('')]
}
function blockToChild(b: DocBlock): Paragraph | Table {
  if (b.type === 'table') {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: b.rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell) => new TableCell({ children: cell.blocks.length ? cell.blocks.map(blockToChild) : [new Paragraph('')] }))
          })
      )
    })
  }
  if (b.type === 'hr') {
    return new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } } })
  }
  if (b.type === 'heading') {
    return new Paragraph({ heading: headingOf(b.level), alignment: alignOf(b.align), children: runsOf(b.runs) })
  }
  if (b.type === 'listItem') {
    return new Paragraph({
      alignment: alignOf(b.align),
      children: runsOf(b.runs),
      ...(b.ordered ? { numbering: { reference: `ord${b.numId ?? 0}`, level: b.level } } : { bullet: { level: b.level } })
    })
  }
  return new Paragraph({ alignment: alignOf(b.align), children: runsOf(b.runs) })
}

export function registerDocsIpc(): void {
  ipcMain.handle('docx:toHtml', async (_e, path: string) => {
    const r = await mammoth.convertToHtml({ path })
    return r.value
  })
  ipcMain.handle('docx:build', async (_e, blocks: DocBlock[], path: string) => {
    // Cada lista numerada de nível superior ganha sua própria referência, para reiniciar a contagem.
    const refs = new Set<number>()
    const scan = (bs: DocBlock[]): void => {
      for (const b of bs) {
        if (b.type === 'listItem' && b.ordered) refs.add(b.numId ?? 0)
        else if (b.type === 'table') for (const row of b.rows) for (const cell of row) scan(cell.blocks)
      }
    }
    scan(blocks)
    const levels = Array.from({ length: 9 }, (_, i) => ({
      level: i,
      format: LevelFormat.DECIMAL,
      text: `%${i + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } }
    }))
    const config = [...refs].map((id) => ({ reference: `ord${id}`, levels }))
    const doc = new Document({
      ...(config.length ? { numbering: { config } } : {}),
      sections: [{ children: blocks.map(blockToChild) }]
    })
    const buf = await Packer.toBuffer(doc)
    await fs.writeFile(path, buf)
  })
}
