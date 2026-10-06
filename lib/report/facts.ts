/** A row of a facts table: a label, its value, and an optional small note under the value. */
export interface FactRow {
  label: string;
  value: string;
  note?: string;
}
