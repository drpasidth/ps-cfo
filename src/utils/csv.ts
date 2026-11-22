// Minimal RFC-4180 style CSV parser (quoted fields, escaped quotes, multi-line fields). Strips a UTF-8 BOM.
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const out: string[][] = [];
  let rec: string[] = [];
  let f = "";
  let q = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) {
      if (c === '"') {
        if (s[k + 1] === '"') { f += '"'; k++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; }
    else if (c === "\r") { /* skip */ }
    else f += c;
  }
  if (f.length || rec.length) { rec.push(f); out.push(rec); }
  return out.filter((r) => r.some((v) => v.trim() !== ""));
}

export function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Save text as a UTF-8 (with BOM, so Excel shows Thai correctly) CSV file.
export function downloadText(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
