/**
 * The minimum widths, in px, of the LLM usage tables' columns: each column's
 * header with its sort arrow and the cell's padding, and the widest usual
 * value under it (a five-figure spend like `CHF12,345`, a share like `100%`). Given as
 * the columns' `minWidth`, they keep headers and figures whole (the `tables`
 * skill, "Rule: typical content fits"); summed by `tableMinWidth`, they say
 * when a table takes its compact columns.
 */
export const USAGE_COLUMN_MIN_WIDTH = {
  /**
   * A name column, as ui-react's `TABLE_NAME_COLUMN_MIN_WIDTH`: a name with
   * By agent's Removed badge and hint. The rest ends in an ellipsis.
   */
  name: 160,
  /** "Model calls". */
  calls: 120,
  /** "Tokens", or a token count like `85.8M`. */
  tokens: 90,
  /**
   * "Spend", or a spend as `formatMoney` writes it: whole units from 100
   * up, so `$123,456` or `CHF12,345` (69px) in a converted currency.
   */
  spend: 96,
  /** "Share of spend". */
  share: 140,
  /** "$/1M tokens". */
  rate: 130,
  /** "Cost/1M tokens", the rate in a converted currency. */
  convertedRate: 150,
  /** "Tokens/call". */
  tokensPerCall: 120,
} as const;
