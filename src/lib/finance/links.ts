/** Where an automatic entry's record lives in the app (pure). */
export function sourceHref(financeBase: string, source: string, sourceId: string | null, slug: string) {
  if (!sourceId) return null;
  switch (source) {
    case "invoice":
      return `${financeBase}/invoices/${sourceId}`;
    case "bill":
      return `${financeBase}/bills/${sourceId}`;
    case "payment":
      return `/print/${slug}/finance/payments/${sourceId}`;
    case "loan":
      return `/w/${slug}/loans/${sourceId}`;
    case "transfer":
    case "opening":
      return `${financeBase}/accounts`;
    default:
      return null;
  }
}
