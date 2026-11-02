import type { Quote } from "./customerFlow";
import type { Settings } from "./types";

export function pricingSummary(quote: Quote, settings: Settings) {
  // Do not guess rates from the shop cache: show only the current server quote.
  if (quote.rate === undefined || quote.paperMultiplier === undefined)
    return null;
  const currency = (amount: number) => `₱${amount.toFixed(2)}`;
  const terms = [
    `${quote.pages} ${quote.pages === 1 ? "page" : "pages"}`,
    `${currency(quote.rate)} per page`,
  ];
  if (settings.copies > 1) terms.push(`${settings.copies} copies`);
  if (quote.paperMultiplier !== 1)
    terms.push(`${quote.paperMultiplier} (Legal paper)`);
  return {
    title: `${settings.paper} · ${settings.color}`,
    equation: `${terms.join(" × ")} = ${currency(quote.amount)}`,
  };
}
