/**
 * §3.4 NoDataChip: only for coverage `none` ("No data", "No interaction data", "Not checked" with the no_data count,
 * and "A + B" pairs not checked because one side has no data). Never for not_run, no_route, unmapped or same_product.
 */
export default function NoDataChip({ label }: { label: string }) {
  return <span className="sev sev--nodata">{label}</span>;
}
