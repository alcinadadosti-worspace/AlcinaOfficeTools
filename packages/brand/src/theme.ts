// Tema Fluent UI da suíte, derivado do verde da marca Alcina.
import { createLightTheme, createDarkTheme, type BrandVariants, type Theme } from '@fluentui/react-components'

export const alcinaGreen: BrandVariants = {
  10: '#040f07',
  20: '#06220f',
  30: '#073012',
  40: '#083d17',
  50: '#0a4b1d',
  60: '#0b5a24',
  70: '#0d6a2b',
  80: '#0f7a34',
  90: '#2e8f4b',
  100: '#4a9f63',
  110: '#67af7c',
  120: '#83bf95',
  130: '#9ecfae',
  140: '#b9dec8',
  150: '#d3eedd',
  160: '#eef9f2'
}

const fontFamilyBase = "'Segoe UI', 'Segoe UI Variable', system-ui, -apple-system, sans-serif"

export const lightTheme: Theme = {
  ...createLightTheme(alcinaGreen),
  fontFamilyBase,
  fontSizeBase300: '13px',
  borderRadiusMedium: '4px'
}

export const darkTheme: Theme = {
  ...createDarkTheme(alcinaGreen),
  fontFamilyBase,
  fontSizeBase300: '13px',
  borderRadiusMedium: '4px'
}
