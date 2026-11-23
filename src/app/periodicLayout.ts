/** Where an element sits in the standard 18-column periodic table. */
export interface PeriodicCell {
  /** 1-7 for the main table; 9 and 10 for the lanthanide and actinide rows below it. */
  row: number;
  /** 1-18 (the f-block rows use columns 3-17). */
  column: number;
  block: 's' | 'p' | 'd' | 'f';
}

/** Rows of the detached f-block (row 8 is left empty as a gap). */
export const LANTHANIDE_ROW = 9;
export const ACTINIDE_ROW = 10;

/** First atomic number of each period. */
const PERIOD_STARTS = [1, 3, 11, 19, 37, 55, 87, 119];

export function periodicCell(z: number): PeriodicCell {
  if (!Number.isInteger(z) || z < 1 || z > 118) throw new Error(`No periodic table cell for Z=${z}`);
  if (z === 1) return { row: 1, column: 1, block: 's' };
  // Helium is s-block, but it is shown (and coloured) with the noble gases in group 18.
  if (z === 2) return { row: 1, column: 18, block: 'p' };

  const period = PERIOD_STARTS.findIndex((start, i) => z >= start && z < PERIOD_STARTS[i + 1]) + 1;
  const index = z - PERIOD_STARTS[period - 1]; // 0-based position within the period

  if (period <= 3) {
    // Two s-block columns, then six p-block columns at the right (groups 13-18).
    return index < 2 ? { row: period, column: index + 1, block: 's' } : { row: period, column: index + 11, block: 'p' };
  }
  if (period <= 5) {
    const column = index + 1;
    return { row: period, column, block: column <= 2 ? 's' : column <= 12 ? 'd' : 'p' };
  }

  // Periods 6 and 7: two s columns, 15 f-block elements in the row below, then groups 4-18.
  if (index < 2) return { row: period, column: index + 1, block: 's' };
  if (index < 17) return { row: period === 6 ? LANTHANIDE_ROW : ACTINIDE_ROW, column: index + 1, block: 'f' };
  const column = index - 13;
  return { row: period, column, block: column <= 12 ? 'd' : 'p' };
}
