/**
 * P8 Code Audit Test — Revenue calculator with deliberate TypeScript bug
 * Bug: parameter 'price' declared as 'string' but used in arithmetic (* operator)
 * TypeScript error: TS2362 — Left-hand side of arithmetic must be number, not string
 * @audit-test true — managed by code-audit-runner, do not edit manually
 */

export function calculateRevenue(price: number, days: number): number {
  // TS2362: The left-hand side of an arithmetic operation must be of type
  // 'any', 'number', 'bigint' or an enum type. Type 'string' is not assignable.
  return price * days;
}

export function formatAmount(amount: number): string {
  return `${amount.toFixed(2)} DZD`;
}
