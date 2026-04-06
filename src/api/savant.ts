/**
 * Baseball Savant Statcast API Client
 * CSV leaderboard endpoints (no auth required)
 */

export interface BatterStatcast {
  name: string;
  playerId: string;
  attempts: number;
  avgExitVelo: number;
  maxExitVelo: number;
  avgLaunchAngle: number;
  barrelPct: number;
  hardHitPct: number;
  sweetSpotPct: number;
  xBA: number;
  xSLG: number;
  xwOBA: number;
  baDiff: number;
  wobaDiff: number;
}

export interface PitcherStatcast {
  name: string;
  playerId: string;
  attempts: number;
  avgExitVeloAgainst: number;
  barrelPctAgainst: number;
  hardHitPctAgainst: number;
  xBA: number;
  xSLG: number;
  xwOBA: number;
  baDiff: number;
  wobaDiff: number;
}

function splitCsvLine(line: string): string[] {
  const vals: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === "," && !inQuote) {
      vals.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  vals.push(cur.trim());
  return vals;
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\n");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] || ""));
    return row;
  });
}

function savantNameToFull(savantName: string): string {
  // "Ohtani, Shohei" → "Shohei Ohtani"
  const parts = savantName.split(",").map((s) => s.trim());
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : savantName;
}

export async function fetchBatterStatcast(
  year = 2026,
  minPA = 10,
): Promise<BatterStatcast[]> {
  const [scRes, xRes] = await Promise.all([
    fetch(
      `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${year}&position=&team=&min=${minPA}&csv=true`,
    ),
    fetch(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${year}&position=&team=&min=${minPA}&csv=true`,
    ),
  ]);
  const scData = parseCsv(await scRes.text());
  const xData = parseCsv(await xRes.text());

  const xMap = new Map<string, Record<string, string>>();
  for (const row of xData) xMap.set(row["player_id"], row);

  return scData.map((row) => {
    const x = xMap.get(row["player_id"]) || {};
    return {
      name: savantNameToFull(row["last_name, first_name"] || ""),
      playerId: row["player_id"],
      attempts: parseInt(row["attempts"]) || 0,
      avgExitVelo: parseFloat(row["avg_hit_speed"]) || 0,
      maxExitVelo: parseFloat(row["max_hit_speed"]) || 0,
      avgLaunchAngle: parseFloat(row["avg_hit_angle"]) || 0,
      barrelPct: parseFloat(row["brl_percent"]) || 0,
      hardHitPct: parseFloat(row["ev95percent"]) || 0,
      sweetSpotPct: parseFloat(row["anglesweetspotpercent"]) || 0,
      xBA: parseFloat(x["est_ba"]) || 0,
      xSLG: parseFloat(x["est_slg"]) || 0,
      xwOBA: parseFloat(x["est_woba"]) || 0,
      baDiff: parseFloat(x["est_ba_minus_ba_diff"]) || 0,
      wobaDiff: parseFloat(x["est_woba_minus_woba_diff"]) || 0,
    };
  });
}

export async function fetchPitcherStatcast(
  year = 2026,
  minPA = 10,
): Promise<PitcherStatcast[]> {
  const [scRes, xRes] = await Promise.all([
    fetch(
      `https://baseballsavant.mlb.com/leaderboard/statcast?type=pitcher&year=${year}&position=&team=&min=${minPA}&csv=true`,
    ),
    fetch(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${year}&position=&team=&min=${minPA}&csv=true`,
    ),
  ]);
  const scData = parseCsv(await scRes.text());
  const xData = parseCsv(await xRes.text());
  const xMap = new Map<string, Record<string, string>>();
  for (const row of xData) xMap.set(row["player_id"], row);

  return scData.map((row) => {
    const x = xMap.get(row["player_id"]) || {};
    return {
      name: savantNameToFull(row["last_name, first_name"] || ""),
      playerId: row["player_id"],
      attempts: parseInt(row["attempts"]) || 0,
      avgExitVeloAgainst: parseFloat(row["avg_hit_speed"]) || 0,
      barrelPctAgainst: parseFloat(row["brl_percent"]) || 0,
      hardHitPctAgainst: parseFloat(row["ev95percent"]) || 0,
      xBA: parseFloat(x["est_ba"]) || 0,
      xSLG: parseFloat(x["est_slg"]) || 0,
      xwOBA: parseFloat(x["est_woba"]) || 0,
      baDiff: parseFloat(x["est_ba_minus_ba_diff"]) || 0,
      wobaDiff: parseFloat(x["est_woba_minus_woba_diff"]) || 0,
    };
  });
}
