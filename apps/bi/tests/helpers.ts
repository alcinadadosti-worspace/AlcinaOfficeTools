import { makeDate, addMonths, weekNum, endOfMonth } from '@engine/data/dates'

export { makeDate, addMonths, weekNum }

export function eomonthCheck(): boolean {
  return endOfMonth(makeDate(2023, 2, 10)) === makeDate(2023, 2, 28) && endOfMonth(makeDate(2024, 2, 10)) === makeDate(2024, 2, 29)
}
