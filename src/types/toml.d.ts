/**
 * Type declarations for @iarna/toml
 */
declare module "@iarna/toml" {
  /**
   * Parse a TOML string into a JavaScript object
   */
  export function parse<T = Record<string, unknown>>(input: string): T;

  /**
   * Stringify a JavaScript object into a TOML string
   */
  export function stringify(input: Record<string, unknown>): string;
}
