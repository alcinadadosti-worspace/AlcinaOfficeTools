// Nomes padrão (pt-BR) das etapas aplicadas e geração de identificadores.
import type { DatePart, NumberTransform, StepOp, TextTransform } from './types'

let idCounter = 0

/** Gera um identificador único para etapas e consultas. */
export function newId(prefix = 's'): string {
  idCounter = (idCounter + 1) % 1_000_000
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) return `${prefix}_${g.crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export const SOURCE_STEP_NAME = 'Fonte'

const TEXT_NAMES: Record<TextTransform, string> = {
  lower: 'Texto em Minúscula',
  upper: 'Texto em Maiúscula',
  capitalize: 'Cada Palavra Em Maiúscula',
  trim: 'Texto Aparado',
  clean: 'Texto Limpo',
  prefix: 'Prefixo Adicionado',
  suffix: 'Sufixo Adicionado',
  length: 'Comprimento Calculado',
  reverse: 'Texto Invertido',
  removeSpaces: 'Espaços Removidos'
}

const NUMBER_NAMES: Record<NumberTransform, string> = {
  round: 'Arredondado',
  roundUp: 'Arredondado para Cima',
  roundDown: 'Arredondado para Baixo',
  abs: 'Valor Absoluto Calculado',
  sqrt: 'Raiz Quadrada Calculada',
  square: 'Quadrado Calculado',
  add: 'Adição',
  subtract: 'Subtração',
  multiply: 'Multiplicação',
  divide: 'Divisão',
  integerDivide: 'Divisão de Inteiro',
  mod: 'Módulo Calculado',
  power: 'Potência Calculada',
  negate: 'Sinal Invertido',
  sign: 'Sinal Calculado',
  log10: 'Logaritmo de Base 10 Calculado',
  ln: 'Logaritmo Natural Calculado',
  exp: 'Exponencial Calculado',
  percentage: 'Porcentagem Calculada',
  isEven: 'Par Calculado',
  isOdd: 'Ímpar Calculado'
}

export const DATE_PART_LABEL: Record<DatePart, string> = {
  year: 'Ano',
  startOfYear: 'Início do Ano',
  endOfYear: 'Fim do Ano',
  month: 'Mês',
  monthName: 'Nome do Mês',
  startOfMonth: 'Início do Mês',
  endOfMonth: 'Fim do Mês',
  daysInMonth: 'Dias no Mês',
  quarter: 'Trimestre',
  startOfQuarter: 'Início do Trimestre',
  endOfQuarter: 'Fim do Trimestre',
  weekOfYear: 'Semana do Ano',
  weekOfMonth: 'Semana do Mês',
  startOfWeek: 'Início da Semana',
  endOfWeek: 'Fim da Semana',
  day: 'Dia',
  dayOfWeek: 'Dia da Semana',
  dayOfYear: 'Dia do Ano',
  dayName: 'Nome do Dia',
  date: 'Data',
  time: 'Hora',
  hour: 'Hora',
  minute: 'Minuto',
  second: 'Segundo',
  age: 'Idade'
}

/** Nome padrão de uma etapa, como no editor de consultas do Power Query em pt-BR. */
export function defaultStepName(op: StepOp): string {
  switch (op.op) {
    case 'promoteHeaders':
      return 'Cabeçalhos Promovidos'
    case 'demoteHeaders':
      return 'Cabeçalhos Rebaixados'
    case 'changeTypes':
      return 'Tipo Alterado'
    case 'removeColumns':
      return 'Colunas Removidas'
    case 'selectColumns':
      return 'Outras Colunas Removidas'
    case 'renameColumns':
      return 'Colunas Renomeadas'
    case 'reorderColumns':
      return 'Colunas Reordenadas'
    case 'duplicateColumn':
      return 'Coluna Duplicada'
    case 'filterRows':
      return 'Linhas Filtradas'
    case 'keepRows':
      return op.mode === 'top' ? 'Linhas Superiores Mantidas' : op.mode === 'bottom' ? 'Linhas Inferiores Mantidas' : 'Intervalo de Linhas Mantido'
    case 'removeRows':
      switch (op.mode) {
        case 'top':
          return 'Linhas Superiores Removidas'
        case 'bottom':
          return 'Linhas Inferiores Removidas'
        case 'alternate':
          return 'Linhas Alternadas Removidas'
        case 'blank':
          return 'Linhas em Branco Removidas'
        default:
          return 'Erros Removidos'
      }
    case 'removeDuplicates':
      return 'Duplicatas Removidas'
    case 'keepDuplicates':
      return 'Duplicatas Mantidas'
    case 'sort':
      return 'Linhas Classificadas'
    case 'replaceValues':
      return 'Valor Substituído'
    case 'replaceErrors':
      return 'Erros Substituídos'
    case 'fill':
      return op.direction === 'down' ? 'Preenchido Abaixo' : 'Preenchido Acima'
    case 'splitColumn':
      if (op.mode === 'positions') return 'Dividir Coluna por Posição'
      if (op.mode === 'length') return 'Dividir Coluna por Número de Caracteres'
      return 'Dividir Coluna por Delimitador'
    case 'mergeColumns':
      return op.keepOriginal ? 'Colunas Mescladas Inseridas' : 'Colunas Mescladas'
    case 'transformText':
      return TEXT_NAMES[op.fn] + (op.newName ? ' Inserido' : '')
    case 'transformNumber':
      return NUMBER_NAMES[op.fn] + (op.newName ? ' Inserido' : '')
    case 'datePart':
      return `${DATE_PART_LABEL[op.part]} ${op.newName ? 'Inserido' : 'Extraído'}`
    case 'extractText':
      switch (op.mode) {
        case 'length':
          return op.newName ? 'Comprimento Inserido' : 'Comprimento Extraído'
        case 'first':
          return op.newName ? 'Primeiros Caracteres Inseridos' : 'Primeiros Caracteres Extraídos'
        case 'last':
          return op.newName ? 'Últimos Caracteres Inseridos' : 'Últimos Caracteres Extraídos'
        case 'range':
          return op.newName ? 'Intervalo de Texto Inserido' : 'Intervalo de Texto Extraído'
        case 'beforeDelimiter':
          return op.newName ? 'Texto Antes do Delimitador Inserido' : 'Texto Antes do Delimitador Extraído'
        case 'afterDelimiter':
          return op.newName ? 'Texto Após o Delimitador Inserido' : 'Texto Após o Delimitador Extraído'
        default:
          return op.newName ? 'Texto Entre Delimitadores Inserido' : 'Texto Entre Delimitadores Extraído'
      }
    case 'addColumn':
      return 'Personalização Adicionada'
    case 'conditionalColumn':
      return 'Coluna Condicional Adicionada'
    case 'indexColumn':
      return 'Índice Adicionado'
    case 'groupBy':
      return 'Linhas Agrupadas'
    case 'unpivot':
      return op.mode === 'others' ? 'Outras Colunas Não Dinamizadas' : 'Colunas Não Dinamizadas'
    case 'pivot':
      return 'Coluna Dinamizada'
    case 'transpose':
      return 'Tabela Transposta'
    case 'merge':
      return 'Consultas Mescladas'
    case 'append':
      return 'Consulta Acrescentada'
  }
}

/** Garante nome único entre as etapas ("Tipo Alterado1", "Tipo Alterado2"...). */
export function uniqueStepName(name: string, existing: Iterable<string>): string {
  const set = new Set<string>()
  for (const e of existing) set.add(e.toLowerCase())
  if (!set.has(name.toLowerCase())) return name
  let i = 1
  while (set.has(`${name}${i}`.toLowerCase())) i++
  return `${name}${i}`
}

/** Garante nome único de consulta ("Consulta (2)"). */
export function uniqueQueryName(name: string, existing: Iterable<string>): string {
  const set = new Set<string>()
  for (const e of existing) set.add(e.toLowerCase())
  if (!set.has(name.toLowerCase())) return name
  let i = 2
  while (set.has(`${name} (${i})`.toLowerCase())) i++
  return `${name} (${i})`
}
