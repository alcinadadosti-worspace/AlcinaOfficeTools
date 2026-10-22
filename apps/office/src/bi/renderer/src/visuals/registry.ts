// Definições dos tipos de visual: papéis (poços de campos) e opções de formatação.
import type { VisualType, VisualDef } from '../report/types'

export type RoleKind = 'grouping' | 'measure' | 'any'

export interface RoleDef {
  name: string
  label: string
  kind: RoleKind
  max?: number
  /** Vários campos formam uma hierarquia (detalhamento). */
  hierarchy?: boolean
}

export type FormatPropType = 'toggle' | 'color' | 'number' | 'text' | 'select' | 'slider' | 'textarea'

export interface FormatProp {
  key: string
  label: string
  type: FormatPropType
  default: unknown
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
}

export interface FormatGroup {
  key: string
  label: string
  /** Propriedade booleana que liga/desliga o grupo (exibida no cabeçalho). */
  toggle?: string
  props: FormatProp[]
}

export interface VisualTypeDef {
  type: VisualType
  name: string
  category: 'chart' | 'card' | 'table' | 'filter' | 'decoration'
  roles: RoleDef[]
  /** Suporta destaque cruzado (mostra a parte selecionada). */
  highlight: boolean
  format: FormatGroup[]
}

// ---------------------------------------------------------------------------
// Grupos de formatação reutilizáveis
// ---------------------------------------------------------------------------

const UNITS = [
  { value: 'auto', label: 'Automático' },
  { value: 'none', label: 'Nenhuma' },
  { value: 'thousands', label: 'Milhares' },
  { value: 'millions', label: 'Milhões' },
  { value: 'billions', label: 'Bilhões' },
  { value: 'trillions', label: 'Trilhões' }
]

const ALIGN = [
  { value: 'left', label: 'Esquerda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Direita' }
]

const titleGroup = (show = true): FormatGroup => ({
  key: 'title',
  label: 'Título',
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: show },
    { key: 'text', label: 'Texto', type: 'text', default: '' },
    { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 14, min: 8, max: 48 },
    { key: 'color', label: 'Cor do texto', type: 'color', default: '' },
    { key: 'bold', label: 'Negrito', type: 'toggle', default: false },
    { key: 'align', label: 'Alinhamento', type: 'select', default: 'left', options: ALIGN },
    { key: 'background', label: 'Cor de fundo', type: 'color', default: '' }
  ]
})

const backgroundGroup: FormatGroup = {
  key: 'background',
  label: 'Tela de fundo',
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
    { key: 'color', label: 'Cor', type: 'color', default: '' },
    { key: 'transparency', label: 'Transparência (%)', type: 'slider', default: 0, min: 0, max: 100 }
  ]
}

const borderGroup: FormatGroup = {
  key: 'border',
  label: 'Borda',
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: false },
    { key: 'color', label: 'Cor', type: 'color', default: '#c8c6c4' },
    { key: 'width', label: 'Largura', type: 'number', default: 1, min: 1, max: 10 },
    { key: 'radius', label: 'Arredondamento', type: 'number', default: 4, min: 0, max: 40 }
  ]
}

const shadowGroup: FormatGroup = {
  key: 'shadow',
  label: 'Sombra',
  toggle: 'show',
  props: [{ key: 'show', label: 'Mostrar', type: 'toggle', default: false }]
}

const headerGroup: FormatGroup = {
  key: 'header',
  label: 'Ícones do cabeçalho',
  toggle: 'show',
  props: [{ key: 'show', label: 'Mostrar', type: 'toggle', default: true }]
}

const general = (showTitle = true): FormatGroup[] => [titleGroup(showTitle), backgroundGroup, borderGroup, shadowGroup, headerGroup]

const legendGroup: FormatGroup = {
  key: 'legend',
  label: 'Legenda',
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
    {
      key: 'position',
      label: 'Posição',
      type: 'select',
      default: 'top',
      options: [
        { value: 'top', label: 'Superior' },
        { value: 'bottom', label: 'Inferior' },
        { value: 'left', label: 'Esquerda' },
        { value: 'right', label: 'Direita' }
      ]
    },
    { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 11, min: 8, max: 24 },
    { key: 'showTitle', label: 'Mostrar título', type: 'toggle', default: true }
  ]
}

const xAxisGroup = (label = 'Eixo X'): FormatGroup => ({
  key: 'xAxis',
  label,
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
    { key: 'title', label: 'Título do eixo', type: 'toggle', default: true },
    { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 11, min: 8, max: 24 },
    { key: 'color', label: 'Cor', type: 'color', default: '' },
    { key: 'rotate', label: 'Rotação dos rótulos', type: 'number', default: 0, min: -90, max: 90 }
  ]
})

const yAxisGroup = (label = 'Eixo Y'): FormatGroup => ({
  key: 'yAxis',
  label,
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
    { key: 'title', label: 'Título do eixo', type: 'toggle', default: true },
    { key: 'min', label: 'Início (vazio = automático)', type: 'text', default: '' },
    { key: 'max', label: 'Fim (vazio = automático)', type: 'text', default: '' },
    { key: 'units', label: 'Unidades de exibição', type: 'select', default: 'auto', options: UNITS },
    { key: 'gridlines', label: 'Linhas de grade', type: 'toggle', default: true },
    { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 11, min: 8, max: 24 },
    { key: 'color', label: 'Cor', type: 'color', default: '' },
    { key: 'log', label: 'Escala logarítmica', type: 'toggle', default: false }
  ]
})

const dataLabelsGroup = (show = false): FormatGroup => ({
  key: 'labels',
  label: 'Rótulos de dados',
  toggle: 'show',
  props: [
    { key: 'show', label: 'Mostrar', type: 'toggle', default: show },
    {
      key: 'position',
      label: 'Posição',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Automático' },
        { value: 'inside', label: 'Dentro' },
        { value: 'outside', label: 'Fora' }
      ]
    },
    { key: 'units', label: 'Unidades de exibição', type: 'select', default: 'auto', options: UNITS },
    { key: 'decimals', label: 'Casas decimais (vazio = auto)', type: 'text', default: '' },
    { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 10, min: 7, max: 24 },
    { key: 'color', label: 'Cor', type: 'color', default: '' }
  ]
})

const colorsGroup: FormatGroup = {
  key: 'colors',
  label: 'Cores',
  props: [
    { key: 'default', label: 'Cor padrão', type: 'color', default: '' },
    { key: 'showAll', label: 'Mostrar todos (cores por categoria)', type: 'toggle', default: false }
  ]
}

const barsGroup: FormatGroup = {
  key: 'bars',
  label: 'Colunas',
  props: [
    { key: 'maxWidth', label: 'Largura máxima (px)', type: 'number', default: 32, min: 4, max: 120 },
    { key: 'gap', label: 'Espaço entre categorias (%)', type: 'slider', default: 30, min: 0, max: 80 },
    { key: 'radius', label: 'Cantos arredondados', type: 'number', default: 4, min: 0, max: 16 }
  ]
}

const linesGroup: FormatGroup = {
  key: 'lines',
  label: 'Linhas',
  props: [
    { key: 'width', label: 'Espessura', type: 'number', default: 2, min: 1, max: 8 },
    { key: 'smooth', label: 'Suavizar', type: 'toggle', default: false },
    { key: 'markers', label: 'Marcadores', type: 'toggle', default: false },
    { key: 'area', label: 'Preencher área', type: 'toggle', default: false }
  ]
}

const zoomGroup: FormatGroup = {
  key: 'zoom',
  label: 'Controle deslizante de zoom',
  toggle: 'show',
  props: [{ key: 'show', label: 'Mostrar', type: 'toggle', default: false }]
}

const cartesian = (yLabel = 'Eixo Y', xLabel = 'Eixo X', bars = true): FormatGroup[] => [
  legendGroup,
  xAxisGroup(xLabel),
  yAxisGroup(yLabel),
  dataLabelsGroup(),
  colorsGroup,
  ...(bars ? [barsGroup] : [linesGroup]),
  zoomGroup,
  ...general()
]

const categoryRoles = (cat = 'Eixo X', val = 'Eixo Y'): RoleDef[] => [
  { name: 'category', label: cat, kind: 'grouping', hierarchy: true },
  { name: 'series', label: 'Legenda', kind: 'grouping', max: 1 },
  { name: 'values', label: val, kind: 'measure' },
  { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
]

const pieFormat: FormatGroup[] = [
  legendGroup,
  {
    key: 'slices',
    label: 'Rótulos de detalhe',
    toggle: 'show',
    props: [
      { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
      {
        key: 'content',
        label: 'Conteúdo',
        type: 'select',
        default: 'percent',
        options: [
          { value: 'category', label: 'Categoria' },
          { value: 'value', label: 'Valor' },
          { value: 'percent', label: 'Porcentagem do total' },
          { value: 'categoryPercent', label: 'Categoria, porcentagem' },
          { value: 'categoryValue', label: 'Categoria, valor' }
        ]
      },
      { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 11, min: 7, max: 24 },
      { key: 'innerRadius', label: 'Raio interno (%) — rosca', type: 'slider', default: 55, min: 0, max: 85 }
    ]
  },
  colorsGroup,
  ...general()
]

const cardFormat: FormatGroup[] = [
  {
    key: 'callout',
    label: 'Valor do texto explicativo',
    props: [
      { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 32, min: 10, max: 96 },
      { key: 'color', label: 'Cor', type: 'color', default: '' },
      { key: 'units', label: 'Unidades de exibição', type: 'select', default: 'auto', options: UNITS },
      { key: 'decimals', label: 'Casas decimais (vazio = auto)', type: 'text', default: '' },
      { key: 'align', label: 'Alinhamento', type: 'select', default: 'center', options: ALIGN }
    ]
  },
  {
    key: 'category',
    label: 'Rótulo da categoria',
    toggle: 'show',
    props: [
      { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
      { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 12, min: 8, max: 32 },
      { key: 'color', label: 'Cor', type: 'color', default: '' }
    ]
  },
  ...general(false)
]

const tableFormat = (matrix: boolean): FormatGroup[] => [
  {
    key: 'grid',
    label: 'Grade',
    props: [
      {
        key: 'style',
        label: 'Predefinição de estilo',
        type: 'select',
        default: 'default',
        options: [
          { value: 'default', label: 'Padrão' },
          { value: 'minimal', label: 'Mínimo' },
          { value: 'bold', label: 'Cabeçalho em negrito' },
          { value: 'alternate', label: 'Linhas alternadas' },
          { value: 'sparse', label: 'Esparso' }
        ]
      },
      { key: 'horizontal', label: 'Linhas horizontais', type: 'toggle', default: true },
      { key: 'vertical', label: 'Linhas verticais', type: 'toggle', default: false },
      { key: 'rowPadding', label: 'Espaçamento das linhas', type: 'number', default: 4, min: 0, max: 16 },
      { key: 'fontSize', label: 'Tamanho do texto', type: 'number', default: 12, min: 8, max: 24 },
      { key: 'wrap', label: 'Quebra de texto', type: 'toggle', default: false }
    ]
  },
  {
    key: 'headers',
    label: matrix ? 'Cabeçalhos de linha e coluna' : 'Cabeçalhos de coluna',
    props: [
      { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 12, min: 8, max: 24 },
      { key: 'bold', label: 'Negrito', type: 'toggle', default: true },
      { key: 'color', label: 'Cor do texto', type: 'color', default: '' },
      { key: 'background', label: 'Cor de fundo', type: 'color', default: '' }
    ]
  },
  {
    key: 'values',
    label: 'Valores',
    props: [
      { key: 'units', label: 'Unidades de exibição', type: 'select', default: 'none', options: UNITS },
      { key: 'alternate', label: 'Cor alternada', type: 'color', default: '' }
    ]
  },
  {
    key: 'totals',
    label: matrix ? 'Subtotais e totais' : 'Totais',
    toggle: 'show',
    props: [
      { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
      ...(matrix
        ? [
            { key: 'rowSubtotals', label: 'Subtotais de linha', type: 'toggle' as const, default: true },
            { key: 'columnSubtotals', label: 'Subtotais de coluna', type: 'toggle' as const, default: true },
            { key: 'stepped', label: 'Layout escalonado', type: 'toggle' as const, default: true }
          ]
        : []),
      { key: 'label', label: 'Rótulo', type: 'text', default: 'Total' }
    ]
  },
  {
    key: 'cond',
    label: 'Formatação condicional',
    props: [
      {
        key: 'mode',
        label: 'Aplicar aos valores',
        type: 'select',
        default: 'none',
        options: [
          { value: 'none', label: 'Nenhuma' },
          { value: 'background', label: 'Cor da tela de fundo (escala)' },
          { value: 'font', label: 'Cor da fonte (escala)' },
          { value: 'bars', label: 'Barras de dados' }
        ]
      },
      { key: 'minColor', label: 'Cor do mínimo', type: 'color', default: '#f8fbfc' },
      { key: 'maxColor', label: 'Cor do máximo', type: 'color', default: '#0a8fa3' }
    ]
  },
  ...general(false)
]

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export const VISUALS: VisualTypeDef[] = [
  { type: 'stackedBar', name: 'Gráfico de barras empilhadas', category: 'chart', roles: categoryRoles('Eixo Y', 'Eixo X'), highlight: true, format: cartesian('Eixo X', 'Eixo Y') },
  { type: 'stackedColumn', name: 'Gráfico de colunas empilhadas', category: 'chart', roles: categoryRoles(), highlight: true, format: cartesian() },
  { type: 'bar', name: 'Gráfico de barras clusterizado', category: 'chart', roles: categoryRoles('Eixo Y', 'Eixo X'), highlight: true, format: cartesian('Eixo X', 'Eixo Y') },
  { type: 'column', name: 'Gráfico de colunas clusterizado', category: 'chart', roles: categoryRoles(), highlight: true, format: cartesian() },
  { type: 'percentBar', name: 'Gráfico de barras 100% empilhadas', category: 'chart', roles: categoryRoles('Eixo Y', 'Eixo X'), highlight: true, format: cartesian('Eixo X', 'Eixo Y') },
  { type: 'percentColumn', name: 'Gráfico de colunas 100% empilhadas', category: 'chart', roles: categoryRoles(), highlight: true, format: cartesian() },
  { type: 'line', name: 'Gráfico de linhas', category: 'chart', roles: categoryRoles(), highlight: false, format: cartesian('Eixo Y', 'Eixo X', false) },
  { type: 'area', name: 'Gráfico de área', category: 'chart', roles: categoryRoles(), highlight: false, format: cartesian('Eixo Y', 'Eixo X', false) },
  { type: 'stackedArea', name: 'Gráfico de área empilhada', category: 'chart', roles: categoryRoles(), highlight: false, format: cartesian('Eixo Y', 'Eixo X', false) },
  {
    type: 'lineColumn',
    name: 'Gráfico de linhas e colunas clusterizado',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Eixo X', kind: 'grouping', hierarchy: true },
      { name: 'values', label: 'Eixo Y da coluna', kind: 'measure' },
      { name: 'lineValues', label: 'Eixo Y da linha', kind: 'measure' },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: true,
    format: [
      ...cartesian(),
      { key: 'combo', label: 'Eixo secundário', props: [{ key: 'secondary', label: 'Usar eixo Y secundário para as linhas', type: 'toggle', default: false }] }
    ]
  },
  {
    type: 'lineStackedColumn',
    name: 'Gráfico de linhas e colunas empilhadas',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Eixo X', kind: 'grouping', hierarchy: true },
      { name: 'series', label: 'Legenda da coluna', kind: 'grouping', max: 1 },
      { name: 'values', label: 'Eixo Y da coluna', kind: 'measure', max: 1 },
      { name: 'lineValues', label: 'Eixo Y da linha', kind: 'measure' },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: true,
    format: [
      ...cartesian(),
      { key: 'combo', label: 'Eixo secundário', props: [{ key: 'secondary', label: 'Usar eixo Y secundário para as linhas', type: 'toggle', default: false }] }
    ]
  },
  { type: 'ribbon', name: 'Gráfico de faixa de opções', category: 'chart', roles: categoryRoles(), highlight: true, format: cartesian() },
  {
    type: 'waterfall',
    name: 'Gráfico de cascata',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Categoria', kind: 'grouping', hierarchy: true },
      { name: 'values', label: 'Eixo Y', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: false,
    format: [
      xAxisGroup(),
      yAxisGroup(),
      dataLabelsGroup(true),
      {
        key: 'sentiment',
        label: 'Cores de sentimento',
        props: [
          { key: 'increase', label: 'Aumento', type: 'color', default: '#0ca30c' },
          { key: 'decrease', label: 'Redução', type: 'color', default: '#d03b3b' },
          { key: 'total', label: 'Total', type: 'color', default: '#2a78d6' }
        ]
      },
      ...general()
    ]
  },
  {
    type: 'scatter',
    name: 'Gráfico de dispersão',
    category: 'chart',
    roles: [
      { name: 'details', label: 'Valores', kind: 'grouping' },
      { name: 'x', label: 'Eixo X', kind: 'measure', max: 1 },
      { name: 'y', label: 'Eixo Y', kind: 'measure', max: 1 },
      { name: 'series', label: 'Legenda', kind: 'grouping', max: 1 },
      { name: 'size', label: 'Tamanho', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: false,
    format: [legendGroup, xAxisGroup(), yAxisGroup(), dataLabelsGroup(), colorsGroup, ...general()]
  },
  {
    type: 'pie',
    name: 'Gráfico de pizza',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Legenda', kind: 'grouping', hierarchy: true },
      { name: 'values', label: 'Valores', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: true,
    format: pieFormat
  },
  {
    type: 'donut',
    name: 'Gráfico de rosca',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Legenda', kind: 'grouping', hierarchy: true },
      { name: 'values', label: 'Valores', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: true,
    format: pieFormat
  },
  {
    type: 'treemap',
    name: 'Treemap',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Categoria', kind: 'grouping', hierarchy: true },
      { name: 'values', label: 'Valores', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: true,
    format: [dataLabelsGroup(true), colorsGroup, ...general()]
  },
  {
    type: 'funnel',
    name: 'Funil',
    category: 'chart',
    roles: [
      { name: 'category', label: 'Categoria', kind: 'grouping', hierarchy: true },
      { name: 'values', label: 'Valores', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: true,
    format: [dataLabelsGroup(true), colorsGroup, ...general()]
  },
  {
    type: 'gauge',
    name: 'Medidor',
    category: 'card',
    roles: [
      { name: 'value', label: 'Valor', kind: 'measure', max: 1 },
      { name: 'min', label: 'Valor mínimo', kind: 'measure', max: 1 },
      { name: 'max', label: 'Valor máximo', kind: 'measure', max: 1 },
      { name: 'target', label: 'Valor de destino', kind: 'measure', max: 1 }
    ],
    highlight: false,
    format: [
      {
        key: 'gauge',
        label: 'Eixo do medidor',
        props: [
          { key: 'min', label: 'Mínimo (vazio = 0)', type: 'text', default: '' },
          { key: 'max', label: 'Máximo (vazio = automático)', type: 'text', default: '' },
          { key: 'target', label: 'Destino (vazio = nenhum)', type: 'text', default: '' },
          { key: 'fill', label: 'Cor de preenchimento', type: 'color', default: '' }
        ]
      },
      cardFormat[0],
      ...general()
    ]
  },
  {
    type: 'card',
    name: 'Cartão',
    category: 'card',
    roles: [{ name: 'values', label: 'Campos', kind: 'any', max: 1 }],
    highlight: false,
    format: cardFormat
  },
  {
    type: 'multiCard',
    name: 'Cartão de várias linhas',
    category: 'card',
    roles: [{ name: 'values', label: 'Campos', kind: 'any' }],
    highlight: false,
    format: [
      {
        key: 'callout',
        label: 'Valores',
        props: [
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 22, min: 10, max: 64 },
          { key: 'color', label: 'Cor', type: 'color', default: '' },
          { key: 'units', label: 'Unidades de exibição', type: 'select', default: 'auto', options: UNITS }
        ]
      },
      {
        key: 'category',
        label: 'Rótulos',
        props: [
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 12, min: 8, max: 32 },
          { key: 'color', label: 'Cor', type: 'color', default: '' }
        ]
      },
      ...general(false)
    ]
  },
  {
    type: 'kpi',
    name: 'KPI',
    category: 'card',
    roles: [
      { name: 'value', label: 'Valor', kind: 'measure', max: 1 },
      { name: 'trend', label: 'Eixo de tendência', kind: 'grouping', max: 1 },
      { name: 'target', label: 'Destino', kind: 'measure', max: 1 }
    ],
    highlight: false,
    format: [
      {
        key: 'kpi',
        label: 'Indicador',
        props: [
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 30, min: 10, max: 72 },
          { key: 'units', label: 'Unidades de exibição', type: 'select', default: 'auto', options: UNITS },
          {
            key: 'direction',
            label: 'Direção',
            type: 'select',
            default: 'high',
            options: [
              { value: 'high', label: 'Alto é bom' },
              { value: 'low', label: 'Baixo é bom' }
            ]
          },
          { key: 'goodColor', label: 'Cor boa', type: 'color', default: '#0ca30c' },
          { key: 'badColor', label: 'Cor ruim', type: 'color', default: '#d03b3b' },
          { key: 'showTrend', label: 'Mostrar tendência', type: 'toggle', default: true }
        ]
      },
      ...general()
    ]
  },
  {
    type: 'table',
    name: 'Tabela',
    category: 'table',
    roles: [{ name: 'values', label: 'Colunas', kind: 'any' }],
    highlight: false,
    format: tableFormat(false)
  },
  {
    type: 'matrix',
    name: 'Matriz',
    category: 'table',
    roles: [
      { name: 'rows', label: 'Linhas', kind: 'grouping', hierarchy: true },
      { name: 'columns', label: 'Colunas', kind: 'grouping' },
      { name: 'values', label: 'Valores', kind: 'measure' }
    ],
    highlight: false,
    format: tableFormat(true)
  },
  {
    type: 'slicer',
    name: 'Segmentação de dados',
    category: 'filter',
    roles: [{ name: 'field', label: 'Campo', kind: 'grouping', max: 1 }],
    highlight: false,
    format: [
      {
        key: 'slicer',
        label: 'Configurações da segmentação',
        props: [
          {
            key: 'style',
            label: 'Estilo',
            type: 'select',
            default: 'auto',
            options: [
              { value: 'auto', label: 'Automático' },
              { value: 'list', label: 'Lista vertical' },
              { value: 'tile', label: 'Bloco' },
              { value: 'dropdown', label: 'Lista suspensa' },
              { value: 'between', label: 'Entre (intervalo)' }
            ]
          },
          { key: 'single', label: 'Seleção única', type: 'toggle', default: false },
          { key: 'selectAll', label: 'Mostrar a opção "Selecionar tudo"', type: 'toggle', default: true },
          { key: 'search', label: 'Pesquisa', type: 'toggle', default: true },
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 12, min: 8, max: 24 }
        ]
      },
      {
        key: 'sheader',
        label: 'Cabeçalho da segmentação',
        toggle: 'show',
        props: [
          { key: 'show', label: 'Mostrar', type: 'toggle', default: true },
          { key: 'text', label: 'Texto', type: 'text', default: '' },
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 12, min: 8, max: 24 }
        ]
      },
      ...general(false)
    ]
  },
  {
    type: 'map',
    name: 'Mapa coroplético (Brasil)',
    category: 'chart',
    roles: [
      { name: 'location', label: 'Localização (UF)', kind: 'grouping', max: 1 },
      { name: 'values', label: 'Saturação da cor', kind: 'measure', max: 1 },
      { name: 'tooltips', label: 'Dicas de ferramenta', kind: 'measure' }
    ],
    highlight: false,
    format: [
      {
        key: 'map',
        label: 'Preenchimento',
        props: [
          { key: 'minColor', label: 'Cor do mínimo', type: 'color', default: '#d3ebee' },
          { key: 'maxColor', label: 'Cor do máximo', type: 'color', default: '#0a5f6c' },
          { key: 'labels', label: 'Mostrar siglas', type: 'toggle', default: false }
        ]
      },
      ...general()
    ]
  },
  {
    type: 'text',
    name: 'Caixa de texto',
    category: 'decoration',
    roles: [],
    highlight: false,
    format: [
      {
        key: 'text',
        label: 'Texto',
        props: [
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 18, min: 8, max: 96 },
          { key: 'color', label: 'Cor', type: 'color', default: '' },
          { key: 'bold', label: 'Negrito', type: 'toggle', default: false },
          { key: 'italic', label: 'Itálico', type: 'toggle', default: false },
          { key: 'align', label: 'Alinhamento', type: 'select', default: 'left', options: ALIGN },
          {
            key: 'valign',
            label: 'Alinhamento vertical',
            type: 'select',
            default: 'top',
            options: [
              { value: 'top', label: 'Superior' },
              { value: 'middle', label: 'Meio' },
              { value: 'bottom', label: 'Inferior' }
            ]
          }
        ]
      },
      backgroundGroup,
      borderGroup,
      shadowGroup
    ]
  },
  {
    type: 'shape',
    name: 'Forma',
    category: 'decoration',
    roles: [],
    highlight: false,
    format: [
      {
        key: 'shape',
        label: 'Forma',
        props: [
          {
            key: 'kind',
            label: 'Tipo',
            type: 'select',
            default: 'rectangle',
            options: [
              { value: 'rectangle', label: 'Retângulo' },
              { value: 'rounded', label: 'Retângulo arredondado' },
              { value: 'ellipse', label: 'Oval' },
              { value: 'line', label: 'Linha' }
            ]
          },
          { key: 'fill', label: 'Preenchimento', type: 'color', default: '#e6f4f6' },
          { key: 'transparency', label: 'Transparência (%)', type: 'slider', default: 0, min: 0, max: 100 },
          { key: 'line', label: 'Cor do contorno', type: 'color', default: '#0a8fa3' },
          { key: 'lineWidth', label: 'Espessura do contorno', type: 'number', default: 1, min: 0, max: 12 }
        ]
      },
      shadowGroup
    ]
  },
  {
    type: 'image',
    name: 'Imagem',
    category: 'decoration',
    roles: [],
    highlight: false,
    format: [
      {
        key: 'image',
        label: 'Imagem',
        props: [
          {
            key: 'fit',
            label: 'Dimensionamento',
            type: 'select',
            default: 'contain',
            options: [
              { value: 'contain', label: 'Ajustar' },
              { value: 'cover', label: 'Preencher' },
              { value: 'fill', label: 'Esticar' }
            ]
          }
        ]
      },
      backgroundGroup,
      borderGroup
    ]
  },
  {
    type: 'button',
    name: 'Botão',
    category: 'decoration',
    roles: [],
    highlight: false,
    format: [
      {
        key: 'button',
        label: 'Botão',
        props: [
          { key: 'text', label: 'Texto', type: 'text', default: 'Botão' },
          { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 14, min: 8, max: 48 },
          { key: 'color', label: 'Cor do texto', type: 'color', default: '#ffffff' },
          { key: 'fill', label: 'Preenchimento', type: 'color', default: '#0f7e89' },
          {
            key: 'action',
            label: 'Ação',
            type: 'select',
            default: 'none',
            options: [
              { value: 'none', label: 'Nenhuma' },
              { value: 'page', label: 'Navegação de página' },
              { value: 'clear', label: 'Limpar todas as segmentações' },
              { value: 'url', label: 'URL da Web' }
            ]
          },
          { key: 'target', label: 'Destino (página ou URL)', type: 'text', default: '' }
        ]
      },
      borderGroup,
      shadowGroup
    ]
  }
]

export const VISUAL_BY_TYPE = new Map(VISUALS.map((v) => [v.type, v]))

export function visualDef(type: VisualType): VisualTypeDef {
  return VISUAL_BY_TYPE.get(type)!
}

/** Valor de uma propriedade de formatação (com padrão do esquema). */
export function fmt<T = unknown>(v: VisualDef, group: string, key: string): T {
  const val = v.format[group]?.[key]
  if (val !== undefined && val !== '') return val as T
  const def = VISUAL_BY_TYPE.get(v.type)
    ?.format.find((g) => g.key === group)
    ?.props.find((p) => p.key === key)?.default
  return def as T
}

/** Ordem da galeria de visualizações (como no painel do Power BI). */
export const GALLERY_ORDER: VisualType[] = [
  'stackedBar',
  'stackedColumn',
  'bar',
  'column',
  'percentBar',
  'percentColumn',
  'line',
  'area',
  'stackedArea',
  'lineColumn',
  'lineStackedColumn',
  'ribbon',
  'waterfall',
  'funnel',
  'scatter',
  'pie',
  'donut',
  'treemap',
  'map',
  'gauge',
  'card',
  'multiCard',
  'kpi',
  'slicer',
  'table',
  'matrix'
]
