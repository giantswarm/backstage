/**
 * The minimum widths, in px, of the LLM usage tables' columns: each column's
 * header with its sort arrow and the cell's padding, and the widest usual
 * value under it (a spend of four digits, a share like `100%`). Given as
 * the columns' `minWidth`, they keep headers and figures whole (the `tables`
 * skill, "Rule: typical content fits"); summed by `tableMinWidth`, they say
 * when a table takes its compact columns.
 */
export const USAGE_COLUMN_MIN_WIDTH = {
  /** A name column: the rest of a name ends in an ellipsis or wraps. */
  name: 120,
  /** "Organization", the widest name column header. */
  organization: 130,
  /** "Model calls". */
  calls: 120,
  /** "Tokens", or a token count like `85.8M`. */
  tokens: 90,
  /** "Spend", or a spend like `$1,234.56`. */
  spend: 100,
  /** "Share of spend". */
  share: 140,
  /** "$/1M tokens". */
  rate: 130,
  /** "Cost/1M tokens", the rate in a converted currency. */
  convertedRate: 150,
  /** "Tokens/call". */
  tokensPerCall: 120,
} as const;
