export type BillFilters = { query: string; kind: string; result: string; topic: string };
export const emptyBillFilters: BillFilters = { query: "", kind: "", result: "", topic: "" };
export function readBillFilters(search: string): BillFilters {
  const params = new URLSearchParams(search);
  return { query: (params.get("q") ?? "").slice(0, 200), kind: (params.get("kind") ?? "").slice(0, 60), result: (params.get("result") ?? "").slice(0, 60), topic: (params.get("topic") ?? "").slice(0, 60) };
}
export function billFilterQuery(filters: BillFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of [["q", filters.query], ["kind", filters.kind], ["result", filters.result], ["topic", filters.topic]]) if (value) params.set(key, value);
  return params.toString();
}
export function billListReturn(search: string) {
  const query = billFilterQuery(readBillFilters(new URLSearchParams(search).get("list") ?? ""));
  return `/gians${query ? `?${query}` : ""}`;
}
