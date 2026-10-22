// Geração de código no estilo M para a barra de fórmulas e o editor avançado.
import type { DataType } from '../data/types'
import { SOURCE_STEP_NAME } from './names'
import type { CondOp, JsonScalar, QueryDef, RowCondition, SourceDef, StepDef, StepOp } from './types'

const PLAIN_ID = /^[A-Za-z_][A-Za-z0-9_]*$/
const M_KEYWORDS = new Set(['and', 'as', 'each', 'else', 'error', 'false', 'if', 'in', 'is', 'let', 'meta', 'not', 'null', 'or', 'otherwise', 'section', 'shared', 'then', 'true', 'try', 'type'])

/** Identificador M (com #"..." quando necessário). */
export function mIdent(name: string): string {
  if (PLAIN_ID.test(name) && !M_KEYWORDS.has(name)) return name
  return `#"${name.replace(/"/g, '""')}"`
}

export function mText(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

export function mValue(v: JsonScalar | undefined): string {
  if (v === undefined || v === null) return 'null'
  if (typeof v === 'string') return mText(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : v > 0 ? 'Number.PositiveInfinity' : 'Number.NegativeInfinity'
  const d = new Date(v.date)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const dd = d.getUTCDate()
  if (v.kind === 'date') return `#date(${y}, ${m}, ${dd})`
  if (v.kind === 'time') return `#time(${d.getUTCHours()}, ${d.getUTCMinutes()}, ${d.getUTCSeconds()})`
  return `#datetime(${y}, ${m}, ${dd}, ${d.getUTCHours()}, ${d.getUTCMinutes()}, ${d.getUTCSeconds()})`
}

function list(items: string[]): string {
  return `{${items.join(', ')}}`
}

function texts(names: string[]): string {
  return list(names.map(mText))
}

export function mType(t: DataType): string {
  switch (t) {
    case 'text':
      return 'type text'
    case 'int':
      return 'Int64.Type'
    case 'number':
      return 'type number'
    case 'currency':
      return 'Currency.Type'
    case 'bool':
      return 'type logical'
    case 'date':
      return 'type date'
    case 'datetime':
      return 'type datetime'
    case 'time':
      return 'type time'
    default:
      return 'type any'
  }
}

/** Substitui "_" (parâmetro implícito de each) por uma referência, fora de textos. */
function substituteUnderscore(code: string, replacement: string): string {
  let out = ''
  let inQuote = false
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '"') {
      inQuote = !inQuote
      out += c
      continue
    }
    if (!inQuote && c === '_' && !/\w/.test(code[i - 1] ?? '') && !/\w/.test(code[i + 1] ?? '')) {
      out += replacement
      continue
    }
    out += c
  }
  return out
}

function field(name: string): string {
  return /^[^\]\[#"]+$/.test(name) && name.trim() === name ? `[${name}]` : `[#"${name.replace(/"/g, '""')}"]`
}

function compareExpr(column: string, op: CondOp, value: string, ci: boolean): string {
  const f = field(column)
  const cmp = ci ? ', Comparer.OrdinalIgnoreCase' : ''
  switch (op) {
    case 'eq':
      return `${f} = ${value}`
    case 'ne':
      return `${f} <> ${value}`
    case 'gt':
      return `${f} > ${value}`
    case 'ge':
      return `${f} >= ${value}`
    case 'lt':
      return `${f} < ${value}`
    case 'le':
      return `${f} <= ${value}`
    case 'contains':
      return `Text.Contains(${f}, ${value}${cmp})`
    case 'notContains':
      return `not Text.Contains(${f}, ${value}${cmp})`
    case 'startsWith':
      return `Text.StartsWith(${f}, ${value}${cmp})`
    case 'notStartsWith':
      return `not Text.StartsWith(${f}, ${value}${cmp})`
    case 'endsWith':
      return `Text.EndsWith(${f}, ${value}${cmp})`
    case 'notEndsWith':
      return `not Text.EndsWith(${f}, ${value}${cmp})`
    case 'isNull':
      return `${f} = null`
    case 'isNotNull':
      return `${f} <> null`
    case 'isEmpty':
      return `(${f} = null or ${f} = "")`
    case 'isNotEmpty':
      return `(${f} <> null and ${f} <> "")`
  }
}

export function conditionCode(c: RowCondition): string {
  switch (c.kind) {
    case 'compare':
      return compareExpr(c.column, c.operator, c.valueColumn ? field(c.valueColumn) : mValue(c.value), c.caseSensitive === false)
    case 'in':
      return `${c.negate ? 'not ' : ''}List.Contains(${list(c.values.map(mValue))}, ${field(c.column)})`
    case 'and':
      return c.conditions.map((x) => (x.kind === 'or' ? `(${conditionCode(x)})` : conditionCode(x))).join(' and ')
    case 'or':
      return c.conditions.map((x) => (x.kind === 'and' ? `(${conditionCode(x)})` : conditionCode(x))).join(' or ')
    case 'not':
      return `not (${conditionCode(c.condition)})`
    case 'expression':
      return c.expression.replace(/^\s*each\s+/, '')
  }
}

function cultureName(c: { decimalSep: ',' | '.'; dayFirst: boolean } | undefined): string {
  if (!c) return 'pt-BR'
  if (c.decimalSep === ',') return 'pt-BR'
  return c.dayFirst ? 'en-GB' : 'en-US'
}

const AGG_M: Record<string, string> = {
  sum: 'List.Sum',
  avg: 'List.Average',
  median: 'List.Median',
  min: 'List.Min',
  max: 'List.Max',
  countNonBlank: 'List.NonNullCount',
  countDistinct: 'List.Count(List.Distinct',
  count: 'Table.RowCount'
}

function queryRef(id: string, queries: QueryDef[]): string {
  const q = queries.find((x) => x.id === id)
  return mIdent(q ? q.name : id)
}

function opCode(op: StepOp, prev: string, queries: QueryDef[]): string {
  switch (op.op) {
    case 'promoteHeaders':
      return `Table.PromoteHeaders(${prev}, [PromoteAllScalars=true])`
    case 'demoteHeaders':
      return `Table.DemoteHeaders(${prev})`
    case 'changeTypes':
      return `Table.TransformColumnTypes(${prev}, ${list(op.columns.map((c) => `{${mText(c.column)}, ${mType(c.type)}}`))}, ${mText(cultureName(op.culture))})`
    case 'removeColumns':
      return `Table.RemoveColumns(${prev}, ${texts(op.columns)})`
    case 'selectColumns':
      return `Table.SelectColumns(${prev}, ${texts(op.columns)})`
    case 'renameColumns':
      return `Table.RenameColumns(${prev}, ${list(op.renames.map((r) => `{${mText(r.from)}, ${mText(r.to)}}`))})`
    case 'reorderColumns':
      return `Table.ReorderColumns(${prev}, ${texts(op.columns)})`
    case 'duplicateColumn':
      return `Table.DuplicateColumn(${prev}, ${mText(op.column)}, ${mText(op.newName)})`
    case 'filterRows':
      return `Table.SelectRows(${prev}, each ${conditionCode(op.condition)})`
    case 'keepRows':
      if (op.mode === 'top') return `Table.FirstN(${prev}, ${op.count})`
      if (op.mode === 'bottom') return `Table.LastN(${prev}, ${op.count})`
      return `Table.Range(${prev}, ${op.offset ?? 0}, ${op.count})`
    case 'removeRows':
      switch (op.mode) {
        case 'top':
          return `Table.Skip(${prev}, ${op.count ?? 1})`
        case 'bottom':
          return `Table.RemoveLastN(${prev}, ${op.count ?? 1})`
        case 'alternate':
          return `Table.AlternateRows(${prev}, ${op.offset ?? 0}, ${op.count ?? 1}, ${op.keep ?? 1})`
        case 'blank':
          return `Table.SelectRows(${prev}, each not List.IsEmpty(List.RemoveMatchingItems(Record.FieldValues(_), {"", null})))`
        default:
          return `Table.RemoveRowsWithErrors(${prev}${op.columns?.length ? `, ${texts(op.columns)}` : ''})`
      }
    case 'removeDuplicates':
      return `Table.Distinct(${prev}${op.columns.length ? `, ${texts(op.columns)}` : ''})`
    case 'keepDuplicates': {
      const cols = texts(op.columns)
      return `let columnNames = ${cols}, addCount = Table.Group(${prev}, columnNames, {{"Count", Table.RowCount, type number}}), selectDuplicates = Table.SelectRows(addCount, each [Count] > 1), removeCount = Table.RemoveColumns(selectDuplicates, "Count") in Table.Join(${prev}, columnNames, removeCount, columnNames, JoinKind.Inner)`
    }
    case 'sort':
      return `Table.Sort(${prev}, ${list(op.keys.map((k) => `{${mText(k.column)}, Order.${k.desc ? 'Descending' : 'Ascending'}}`))})`
    case 'replaceValues':
      return `Table.ReplaceValue(${prev}, ${mValue(op.find)}, ${mValue(op.replace)}, Replacer.${op.matchEntire ? 'ReplaceValue' : 'ReplaceText'}, ${texts(op.columns)})`
    case 'replaceErrors':
      return `Table.ReplaceErrorValues(${prev}, ${list(op.columns.map((c) => `{${mText(c)}, ${mValue(op.value)}}`))})`
    case 'fill':
      return `Table.Fill${op.direction === 'down' ? 'Down' : 'Up'}(${prev}, ${texts(op.columns)})`
    case 'splitColumn': {
      let splitter: string
      if (op.mode === 'positions') splitter = `Splitter.SplitTextByPositions(${list((op.positions ?? [0]).map(String))})`
      else if (op.mode === 'length') splitter = `Splitter.SplitTextByRepeatedLengths(${op.length ?? 1})`
      else if (op.at === 'first' || op.at === 'last')
        splitter = `Splitter.SplitTextByEachDelimiter({${mText(op.delimiter ?? ',')}}, QuoteStyle.Csv, ${op.at === 'last' ? 'true' : 'false'})`
      else splitter = `Splitter.SplitTextByDelimiter(${mText(op.delimiter ?? ',')}, QuoteStyle.Csv)`
      if (op.intoRows) {
        return `Table.ExpandListColumn(Table.TransformColumns(${prev}, {{${mText(op.column)}, ${splitter}, let itemType = (type nullable text) meta [Serialized.Text = true] in type {itemType}}}), ${mText(op.column)})`
      }
      const n = op.parts ?? 2
      const names = Array.from({ length: n }, (_, i) => `${op.column}.${i + 1}`)
      return `Table.SplitColumn(${prev}, ${mText(op.column)}, ${splitter}, ${texts(names)})`
    }
    case 'mergeColumns':
      if (op.keepOriginal) {
        return `Table.AddColumn(${prev}, ${mText(op.newName)}, each Text.Combine({${op.columns.map((c) => `Text.From(${field(c)}, "pt-BR")`).join(', ')}}, ${mText(op.separator)}), type text)`
      }
      return `Table.CombineColumns(${prev}, ${texts(op.columns)}, Combiner.CombineTextByDelimiter(${mText(op.separator)}, QuoteStyle.None), ${mText(op.newName)})`
    case 'transformText': {
      const fnCode: Record<string, string> = {
        lower: 'Text.Lower',
        upper: 'Text.Upper',
        capitalize: 'Text.Proper',
        trim: 'Text.Trim',
        clean: 'Text.Clean',
        prefix: `each ${mText(op.arg ?? '')} & _`,
        suffix: `each _ & ${mText(op.arg ?? '')}`,
        length: 'Text.Length',
        reverse: 'Text.Reverse',
        removeSpaces: 'each Text.Remove(_, " ")'
      }
      const f = fnCode[op.fn]
      const type = op.fn === 'length' ? 'Int64.Type' : 'type text'
      if (op.newName) {
        const body = f.startsWith('each ') ? substituteUnderscore(f.slice(5), field(op.columns[0])) : `${f}(${field(op.columns[0])})`
        return `Table.AddColumn(${prev}, ${mText(op.newName)}, each ${body}, ${type})`
      }
      return `Table.TransformColumns(${prev}, ${list(op.columns.map((c) => `{${mText(c)}, ${f}, ${type}}`))})`
    }
    case 'transformNumber': {
      const a = op.arg ?? 0
      const fnCode: Record<string, string> = {
        round: `each Number.Round(_, ${a})`,
        roundUp: `each Number.RoundUp(_, ${a})`,
        roundDown: `each Number.RoundDown(_, ${a})`,
        abs: 'Number.Abs',
        sqrt: 'Number.Sqrt',
        square: 'each Number.Power(_, 2)',
        add: `each _ + ${a}`,
        subtract: `each _ - ${a}`,
        multiply: `each _ * ${a}`,
        divide: `each _ / ${a}`,
        integerDivide: `each Number.IntegerDivide(_, ${a})`,
        mod: `each Number.Mod(_, ${a})`,
        power: `each Number.Power(_, ${a})`,
        negate: 'each -_',
        sign: 'Number.Sign',
        log10: 'Number.Log10',
        ln: 'Number.Ln',
        exp: 'Number.Exp',
        percentage: `each _ * ${a} / 100`,
        isEven: 'Number.IsEven',
        isOdd: 'Number.IsOdd'
      }
      const f = fnCode[op.fn]
      if (op.newName) {
        const body = f.startsWith('each ') ? substituteUnderscore(f.slice(5), field(op.columns[0])) : `${f}(${field(op.columns[0])})`
        return `Table.AddColumn(${prev}, ${mText(op.newName)}, each ${body}, type number)`
      }
      return `Table.TransformColumns(${prev}, ${list(op.columns.map((c) => `{${mText(c)}, ${f}, type number}`))})`
    }
    case 'datePart': {
      const fnCode: Record<string, string> = {
        year: 'Date.Year',
        startOfYear: 'Date.StartOfYear',
        endOfYear: 'Date.EndOfYear',
        month: 'Date.Month',
        monthName: 'each Date.MonthName(_, "pt-BR")',
        startOfMonth: 'Date.StartOfMonth',
        endOfMonth: 'Date.EndOfMonth',
        daysInMonth: 'Date.DaysInMonth',
        quarter: 'Date.QuarterOfYear',
        startOfQuarter: 'Date.StartOfQuarter',
        endOfQuarter: 'Date.EndOfQuarter',
        weekOfYear: 'Date.WeekOfYear',
        weekOfMonth: 'Date.WeekOfMonth',
        startOfWeek: 'Date.StartOfWeek',
        endOfWeek: 'Date.EndOfWeek',
        day: 'Date.Day',
        dayOfWeek: 'Date.DayOfWeek',
        dayOfYear: 'Date.DayOfYear',
        dayName: 'each Date.DayOfWeekName(_, "pt-BR")',
        date: 'DateTime.Date',
        time: 'DateTime.Time',
        hour: 'Time.Hour',
        minute: 'Time.Minute',
        second: 'Time.Second',
        age: 'each Date.From(DateTime.LocalNow()) - _'
      }
      const f = fnCode[op.part]
      if (op.newName) {
        const body = f.startsWith('each ') ? substituteUnderscore(f.slice(5), field(op.column)) : `${f}(${field(op.column)})`
        return `Table.AddColumn(${prev}, ${mText(op.newName)}, each ${body})`
      }
      return `Table.TransformColumns(${prev}, {{${mText(op.column)}, ${f}}})`
    }
    case 'extractText': {
      const del = mText(op.delimiter ?? '')
      const map: Record<string, string> = {
        length: 'Text.Length',
        first: `each Text.Start(_, ${op.count ?? 1})`,
        last: `each Text.End(_, ${op.count ?? 1})`,
        range: `each Text.Middle(_, ${op.start ?? 0}${op.count !== undefined ? `, ${op.count}` : ''})`,
        beforeDelimiter: `each Text.BeforeDelimiter(_, ${del})`,
        afterDelimiter: `each Text.AfterDelimiter(_, ${del})`,
        betweenDelimiters: `each Text.BetweenDelimiters(_, ${del}, ${mText(op.endDelimiter ?? '')})`
      }
      const f = map[op.mode]
      if (op.newName) {
        const body = f.startsWith('each ') ? substituteUnderscore(f.slice(5), field(op.column)) : `${f}(${field(op.column)})`
        return `Table.AddColumn(${prev}, ${mText(op.newName)}, each ${body}, type text)`
      }
      return `Table.TransformColumns(${prev}, {{${mText(op.column)}, ${f}, type text}})`
    }
    case 'addColumn':
      return `Table.AddColumn(${prev}, ${mText(op.name)}, each ${op.expression.replace(/^\s*each\s+/, '')}${op.type ? `, ${mType(op.type)}` : ''})`
    case 'conditionalColumn': {
      let code = ''
      for (const r of op.rules) {
        const val = r.valueColumn ? field(r.valueColumn) : mValue(r.value)
        const out = r.outputColumn ? field(r.outputColumn) : mValue(r.output)
        code += `if ${compareExpr(r.column, r.operator, val, false)} then ${out} else `
      }
      code += op.otherwiseColumn ? field(op.otherwiseColumn) : mValue(op.otherwise)
      return `Table.AddColumn(${prev}, ${mText(op.name)}, each ${code}${op.type ? `, ${mType(op.type)}` : ''})`
    }
    case 'indexColumn':
      return `Table.AddIndexColumn(${prev}, ${mText(op.name)}, ${op.start}, ${op.step}, Int64.Type)`
    case 'groupBy': {
      const aggs = op.aggregations.map((a) => {
        if (a.fn === 'count') return `{${mText(a.name)}, each Table.RowCount(_), Int64.Type}`
        if (a.fn === 'countDistinct') {
          return a.column
            ? `{${mText(a.name)}, each List.Count(List.Distinct(${field(a.column)})), Int64.Type}`
            : `{${mText(a.name)}, each Table.RowCount(Table.Distinct(_)), Int64.Type}`
        }
        return `{${mText(a.name)}, each ${AGG_M[a.fn]}(${field(a.column ?? '')}), type nullable number}`
      })
      return `Table.Group(${prev}, ${texts(op.keys)}, ${list(aggs)})`
    }
    case 'unpivot':
      return op.mode === 'others'
        ? `Table.UnpivotOtherColumns(${prev}, ${texts(op.columns)}, ${mText(op.attribute)}, ${mText(op.value)})`
        : `Table.Unpivot(${prev}, ${texts(op.columns)}, ${mText(op.attribute)}, ${mText(op.value)})`
    case 'pivot': {
      const agg = op.fn === 'none' ? '' : `, ${op.fn === 'count' ? 'List.Count' : (AGG_M[op.fn] ?? 'List.Sum').replace('List.Count(List.Distinct', 'List.Count')}`
      return `Table.Pivot(${prev}, List.Distinct(${prev}[${op.column}]), ${mText(op.column)}, ${mText(op.valueColumn)}${agg})`
    }
    case 'transpose':
      return `Table.Transpose(${prev})`
    case 'merge': {
      const right = queryRef(op.rightQueryId, queries)
      const q = queries.find((x) => x.id === op.rightQueryId)
      const nested = q ? q.name : 'Tabela'
      const kind: Record<string, string> = {
        left: 'JoinKind.LeftOuter',
        right: 'JoinKind.RightOuter',
        full: 'JoinKind.FullOuter',
        inner: 'JoinKind.Inner',
        leftAnti: 'JoinKind.LeftAnti',
        rightAnti: 'JoinKind.RightAnti'
      }
      const join = `Table.NestedJoin(${prev}, ${texts(op.leftKeys)}, ${right}, ${texts(op.rightKeys)}, ${mText(nested)}, ${kind[op.join]})`
      const prefix = op.prefix ?? `${nested}.`
      return `Table.ExpandTableColumn(${join}, ${mText(nested)}, ${texts(op.expand)}, ${texts(op.expand.map((c) => prefix + c))})`
    }
    case 'append':
      return `Table.Combine(${list([prev, ...op.queryIds.map((id) => queryRef(id, queries))])})`
  }
}

function encodingCode(e: string): number {
  switch (e) {
    case 'windows-1252':
      return 1252
    case 'iso-8859-1':
      return 28591
    case 'utf-16le':
      return 1200
    default:
      return 65001
  }
}

function delimiterCode(d: string | undefined): string {
  if (!d || d === 'auto') return mText(',')
  if (d === '\t' || d === '\\t') return '"#(tab)"'
  return mText(d)
}

function sourceCode(source: SourceDef, queries: QueryDef[]): string {
  switch (source.kind) {
    case 'csv':
      return `Csv.Document(File.Contents(${mText(source.path)}), [Delimiter=${delimiterCode(source.delimiter)}, Encoding=${encodingCode(source.encoding)}, QuoteStyle=QuoteStyle.${source.quoted === false ? 'None' : 'Csv'}])`
    case 'excel':
      return `Excel.Workbook(File.Contents(${mText(source.path)}), null, true){[Item=${mText(source.sheet)},Kind="Sheet"]}[Data]`
    case 'json':
      return `Table.FromRecords(Json.Document(File.Contents(${mText(source.path)})))`
    case 'parquet':
      return `Parquet.Document(File.Contents(${mText(source.path)}))`
    case 'web':
      return source.format === 'json' || (source.format === 'auto' && /\.json(\?|$)/i.test(source.url))
        ? `Table.FromRecords(Json.Document(Web.Contents(${mText(source.url)})))`
        : `Csv.Document(Web.Contents(${mText(source.url)}), [Delimiter=${delimiterCode(source.delimiter)}])`
    case 'enterData': {
      const cols = texts(source.columns.map((c) => c.name))
      const rows = list(source.rows.slice(0, 50).map((r) => list(r.map((v) => (v === null ? 'null' : mText(v))))))
      return `#table(${cols}, ${rows})`
    }
    case 'reference':
      return queryRef(source.queryId, queries)
    case 'database': {
      const c = source.connection
      const fn = c.kind === 'postgres' ? 'PostgreSQL.Database' : c.kind === 'mysql' ? 'MySQL.Database' : 'Sql.Database'
      const server = c.port ? `${c.host}:${c.port}` : c.host
      return `${fn}(${mText(server)}, ${mText(c.database)}, [Query=${mText(source.sql)}])`
    }
    case 'folder':
      return `Folder.Files(${mText(source.path)})`
    case 'blank':
      return '#table({}, {})'
  }
}

/** Fórmula da etapa "Fonte". */
export function sourceFormula(source: SourceDef, queries: QueryDef[] = []): string {
  return `= ${sourceCode(source, queries)}`
}

/** Fórmula de uma etapa aplicada (barra de fórmulas). */
export function stepFormula(step: StepDef, prevStepName: string, queries: QueryDef[] = []): string {
  return `= ${opCode(step.op, mIdent(prevStepName), queries)}`
}

/** Script completo da consulta (editor avançado). */
export function queryScript(query: QueryDef, queries: QueryDef[] = []): string {
  const lines: string[] = [`    ${mIdent(SOURCE_STEP_NAME)} = ${sourceCode(query.source, queries)}`]
  let prev = SOURCE_STEP_NAME
  for (const s of query.steps) {
    lines.push(`    ${mIdent(s.name)} = ${opCode(s.op, mIdent(prev), queries)}`)
    prev = s.name
  }
  return `let\n${lines.join(',\n')}\nin\n    ${mIdent(prev)}`
}
