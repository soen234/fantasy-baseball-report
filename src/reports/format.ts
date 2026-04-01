/** 테이블 형식 출력 유틸리티 */

export function printTable(
  headers: string[],
  rows: string[][],
  options?: { padding?: number },
) {
  const pad = options?.padding ?? 2;

  // 각 컬럼 최대 너비 계산
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length)),
  );

  const separator = widths.map((w) => "─".repeat(w + pad)).join("┼");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => (cell || "").padEnd(widths[i] + pad)).join("│");

  console.log(formatRow(headers));
  console.log(separator);
  rows.forEach((row) => console.log(formatRow(row)));
}

export function printSection(title: string) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(50)}\n`);
}
