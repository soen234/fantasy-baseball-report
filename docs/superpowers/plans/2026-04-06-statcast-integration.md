# Statcast Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baseball Savant Statcast 데이터를 대시보드에 통합 — Analysis 탭에 내 팀 선수 Statcast 지표, Activity 탭에 주간 리그 Statcast 리더보드

**Architecture:** Baseball Savant CSV 엔드포인트에서 타자/투수 Statcast 리더보드 + Expected Stats를 가져와 Yahoo 로스터 선수 이름과 매칭. 데이터는 빌드 시 fetch하여 HTML에 임베드.

**Tech Stack:** Baseball Savant CSV API, TypeScript (tsx), 기존 weekly-report-html.ts 확장

---

## File Structure

| File | Role |
|---|---|
| `src/api/savant.ts` (CREATE) | Baseball Savant CSV fetch + parse |
| `src/scripts/weekly-report-html.ts` (MODIFY) | Savant 데이터 fetch, HTML 렌더링 |

---

### Task 1: Baseball Savant API Client

**Files:**
- Create: `src/api/savant.ts`

- [ ] **Step 1: Create savant.ts with CSV fetch + parse**

```typescript
// src/api/savant.ts

interface BatterStatcast {
  name: string;           // "Ohtani, Shohei" → "Shohei Ohtani"
  playerId: string;       // MLB player ID
  attempts: number;       // batted ball events
  avgExitVelo: number;    // avg_hit_speed
  maxExitVelo: number;    // max_hit_speed
  avgLaunchAngle: number; // avg_hit_angle
  barrelPct: number;      // brl_percent
  hardHitPct: number;     // ev95percent
  sweetSpotPct: number;   // anglesweetspotpercent
  xBA: number;            // expected batting average
  xSLG: number;           // expected slugging
  xwOBA: number;          // expected wOBA
  baDiff: number;         // est_ba - ba (luck indicator)
  wobaDiff: number;       // est_woba - woba
}

interface PitcherStatcast {
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

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.replace(/"/g, "").trim());
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
  // Fetch both statcast + expected stats
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

  // Index expected stats by player_id
  const xMap = new Map<string, Record<string, string>>();
  for (const row of xData) xMap.set(row["player_id"], row);

  return scData.map((row) => {
    const x = xMap.get(row["player_id"]) || {};
    return {
      name: savantNameToFull(
        row["last_name, first_name"] || row["last_name"] || "",
      ),
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
      name: savantNameToFull(
        row["last_name, first_name"] || row["last_name"] || "",
      ),
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
```

- [ ] **Step 2: Test the module standalone**

```bash
npx tsx -e "
  import { fetchBatterStatcast, fetchPitcherStatcast } from './src/api/savant.js';
  const b = await fetchBatterStatcast(2026, 10);
  console.log('Batters:', b.length);
  console.log('Sample:', b[0]);
  const p = await fetchPitcherStatcast(2026, 10);
  console.log('Pitchers:', p.length);
  console.log('Sample:', p[0]);
"
```

Expected: Batters/Pitchers > 0, Sample shows parsed fields

- [ ] **Step 3: Commit**

```bash
git add src/api/savant.ts
git commit -m "feat: add Baseball Savant Statcast API client"
```

---

### Task 2: Fetch Statcast in Report Generator + Match to Roster

**Files:**
- Modify: `src/scripts/weekly-report-html.ts` (import + data fetch section, ~line 7-12 and ~line 325-335)

- [ ] **Step 1: Add import and fetch call**

At the top imports, add:
```typescript
import { fetchBatterStatcast, fetchPitcherStatcast } from "../api/savant.js";
```

In the parallel fetch block (the `Promise.all` around line 325), add two more calls:
```typescript
const [standingsRaw, scoreboardRaw, transactionsRaw, hotBatRaw, hotPitRaw, savantBatters, savantPitchers] = await Promise.all([
  getStandings(LEAGUE_KEY),
  getScoreboard(LEAGUE_KEY, week),
  getTransactions(LEAGUE_KEY),
  getHotPlayers(LEAGUE_KEY, "B", 3),
  getHotPlayers(LEAGUE_KEY, "P", 3),
  fetchBatterStatcast(2026, 10).catch(() => []),
  fetchPitcherStatcast(2026, 10).catch(() => []),
]);
console.log(`⚡ Statcast: ${savantBatters.length}B + ${savantPitchers.length}P`);
```

Note: `.catch(() => [])` ensures Savant failure doesn't break the report.

- [ ] **Step 2: Get roster player names for matching**

After the hot players parsing, fetch the current user's roster and build a name list. Add Yahoo API call for roster:

```typescript
// Fetch all rostered players across all teams for name matching
const allRosteredNames: Set<string> = new Set();
const myRosterNames: string[] = [];
// We already have team names from standings; use matchup data to identify players
// For simplicity, fetch MY roster only
const myRosterRaw = await yahooApi(`/team/${MY_TEAM_KEY}/roster/players`);
const rosterPlayers = myRosterRaw?.fantasy_content?.team?.[1]?.roster?.["0"]?.players;
if (rosterPlayers) {
  for (const idx of Object.keys(rosterPlayers)) {
    if (idx === "count") continue;
    const pInfo = rosterPlayers[idx].player[0];
    for (const item of pInfo) {
      if (item?.name?.full) myRosterNames.push(item.name.full);
    }
  }
}
console.log(`📋 My Roster: ${myRosterNames.length} players`);
```

- [ ] **Step 3: Match roster to Statcast**

```typescript
// Match Yahoo names to Savant data (fuzzy: lowercase, remove accents)
function normalizePlayerName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const myBatterStatcast = savantBatters.filter((s) =>
  myRosterNames.some((r) => normalizePlayerName(r) === normalizePlayerName(s.name))
);
const myPitcherStatcast = savantPitchers.filter((s) =>
  myRosterNames.some((r) => normalizePlayerName(r) === normalizePlayerName(s.name))
);
console.log(`⚡ My Statcast matches: ${myBatterStatcast.length}B + ${myPitcherStatcast.length}P`);
```

- [ ] **Step 4: Build + verify**

```bash
npx tsx src/scripts/weekly-report-html.ts auto
```

Expected: `⚡ Statcast:` and `⚡ My Statcast matches:` lines in output

- [ ] **Step 5: Commit**

```bash
git add src/scripts/weekly-report-html.ts
git commit -m "feat: fetch Statcast data and match to roster"
```

---

### Task 3: Analysis Tab — My Team Statcast Table

**Files:**
- Modify: `src/scripts/weekly-report-html.ts` (Analysis tab HTML section)

- [ ] **Step 1: Add Statcast table after Heatmap in Analysis tab**

Find `</div><!-- /tab-analysis -->` and insert before it:

```typescript
    <!-- Statcast: My Team -->
    <div class="card fade-in" style="padding:16px;margin-top:20px;">
      <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">My Team Statcast</div>
      ${myBatterStatcast.length > 0 ? `
      <div class="text-xs fw-600" style="color:var(--accent);margin-bottom:6px;">Batters</div>
      <div style="overflow-x:auto;margin-bottom:16px;">
        <table class="heatmap">
          <thead><tr>
            <th class="hm-team">Player</th>
            <th class="hm-cat">EV</th>
            <th class="hm-cat">MaxEV</th>
            <th class="hm-cat">LA</th>
            <th class="hm-cat">Brl%</th>
            <th class="hm-cat">HH%</th>
            <th class="hm-cat">xBA</th>
            <th class="hm-cat">xSLG</th>
            <th class="hm-cat">xwOBA</th>
            <th class="hm-cat">Luck</th>
          </tr></thead>
          <tbody>
            ${myBatterStatcast.sort((a, b) => b.xwOBA - a.xwOBA).map((p) => {
              const luckColor = p.wobaDiff > 0.02 ? "var(--green)" : p.wobaDiff < -0.02 ? "var(--red)" : "var(--text3)";
              return `<tr>
                <td class="hm-team">${escapeHtml(p.name)}</td>
                <td class="hm-cat">${p.avgExitVelo.toFixed(1)}</td>
                <td class="hm-cat">${p.maxExitVelo.toFixed(1)}</td>
                <td class="hm-cat">${p.avgLaunchAngle.toFixed(1)}</td>
                <td class="hm-cat">${p.barrelPct.toFixed(1)}</td>
                <td class="hm-cat">${p.hardHitPct.toFixed(1)}</td>
                <td class="hm-cat">${p.xBA.toFixed(3)}</td>
                <td class="hm-cat">${p.xSLG.toFixed(3)}</td>
                <td class="hm-cat">${p.xwOBA.toFixed(3)}</td>
                <td class="hm-cat" style="color:${luckColor};">${p.wobaDiff > 0 ? "+" : ""}${p.wobaDiff.toFixed(3)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<div class="text-sm" style="color:var(--text3);">No Statcast data</div>`}
      ${myPitcherStatcast.length > 0 ? `
      <div class="text-xs fw-600" style="color:#a78bfa;margin-bottom:6px;">Pitchers</div>
      <div style="overflow-x:auto;">
        <table class="heatmap">
          <thead><tr>
            <th class="hm-team">Player</th>
            <th class="hm-cat">EV Against</th>
            <th class="hm-cat">Brl% Against</th>
            <th class="hm-cat">HH% Against</th>
            <th class="hm-cat">xBA</th>
            <th class="hm-cat">xSLG</th>
            <th class="hm-cat">xwOBA</th>
            <th class="hm-cat">Luck</th>
          </tr></thead>
          <tbody>
            ${myPitcherStatcast.sort((a, b) => a.xwOBA - b.xwOBA).map((p) => {
              const luckColor = p.wobaDiff < -0.02 ? "var(--green)" : p.wobaDiff > 0.02 ? "var(--red)" : "var(--text3)";
              return `<tr>
                <td class="hm-team">${escapeHtml(p.name)}</td>
                <td class="hm-cat">${p.avgExitVeloAgainst.toFixed(1)}</td>
                <td class="hm-cat">${p.barrelPctAgainst.toFixed(1)}</td>
                <td class="hm-cat">${p.hardHitPctAgainst.toFixed(1)}</td>
                <td class="hm-cat">${p.xBA.toFixed(3)}</td>
                <td class="hm-cat">${p.xSLG.toFixed(3)}</td>
                <td class="hm-cat">${p.xwOBA.toFixed(3)}</td>
                <td class="hm-cat" style="color:${luckColor};">${p.wobaDiff > 0 ? "+" : ""}${p.wobaDiff.toFixed(3)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : ""}
    </div>
```

Key columns explained:
- **EV**: 평균 타구 속도 (높을수록 좋음, 타자 88+ 우수)
- **Brl%**: 배럴 비율 (높을수록 좋음, 타자 8%+ 우수)
- **HH%**: 하드히트 비율 (95mph+, 높을수록 좋음)
- **xBA/xSLG/xwOBA**: 기대 타율/장타율/wOBA (실력 기반, 운 제거)
- **Luck**: xwOBA - wOBA (양수 = 불운, 상승 여지 / 음수 = 행운, 하락 위험)

- [ ] **Step 2: Build + verify**

```bash
npx tsx src/scripts/weekly-report-html.ts auto
open docs/index.html
```

Expected: Analysis 탭에 My Team Statcast 테이블이 Heatmap 아래에 표시

- [ ] **Step 3: Commit**

```bash
git add src/scripts/weekly-report-html.ts
git commit -m "feat: Analysis tab - My Team Statcast table"
```

---

### Task 4: Activity Tab — Weekly Statcast Leaders

**Files:**
- Modify: `src/scripts/weekly-report-html.ts` (Activity tab HTML section)

- [ ] **Step 1: Add Statcast leaderboard in Activity tab**

In the Activity tab, after the Weekly/Season transaction toggle and before `</div><!-- /tab-activity -->`, add a new card:

```typescript
    <!-- Statcast Leaders -->
    <div class="card fade-in" style="padding:16px;margin-top:16px;">
      <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">Statcast Leaders (Season)</div>
      <div class="row-2col" style="gap:16px;">
        <div>
          <div class="text-xs fw-600" style="color:var(--accent);margin-bottom:6px;">Exit Velo Top 10</div>
          ${savantBatters.sort((a, b) => b.avgExitVelo - a.avgExitVelo).slice(0, 10).map((p, i) => {
            const isMyPlayer = myRosterNames.some(r => normalizePlayerName(r) === normalizePlayerName(p.name));
            return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
              <span class="mono text-xs" style="color:var(--text3);width:16px;">${i + 1}</span>
              <span class="text-xs truncate ${isMyPlayer ? "fw-700" : "fw-600"}" style="flex:1;color:${isMyPlayer ? "var(--accent)" : "var(--text2)"};">${escapeHtml(p.name)}</span>
              <span class="mono text-xs fw-600" style="color:var(--text);">${p.avgExitVelo.toFixed(1)}</span>
            </div>`;
          }).join("")}
        </div>
        <div>
          <div class="text-xs fw-600" style="color:var(--amber);margin-bottom:6px;">Barrel% Top 10</div>
          ${savantBatters.sort((a, b) => b.barrelPct - a.barrelPct).slice(0, 10).map((p, i) => {
            const isMyPlayer = myRosterNames.some(r => normalizePlayerName(r) === normalizePlayerName(p.name));
            return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
              <span class="mono text-xs" style="color:var(--text3);width:16px;">${i + 1}</span>
              <span class="text-xs truncate ${isMyPlayer ? "fw-700" : "fw-600"}" style="flex:1;color:${isMyPlayer ? "var(--accent)" : "var(--text2)"};">${escapeHtml(p.name)}</span>
              <span class="mono text-xs fw-600" style="color:var(--text);">${p.barrelPct.toFixed(1)}%</span>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="row-2col" style="gap:16px;margin-top:12px;">
        <div>
          <div class="text-xs fw-600" style="color:var(--green);margin-bottom:6px;">xwOBA Top 10</div>
          ${savantBatters.sort((a, b) => b.xwOBA - a.xwOBA).slice(0, 10).map((p, i) => {
            const isMyPlayer = myRosterNames.some(r => normalizePlayerName(r) === normalizePlayerName(p.name));
            return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
              <span class="mono text-xs" style="color:var(--text3);width:16px;">${i + 1}</span>
              <span class="text-xs truncate ${isMyPlayer ? "fw-700" : "fw-600"}" style="flex:1;color:${isMyPlayer ? "var(--accent)" : "var(--text2)"};">${escapeHtml(p.name)}</span>
              <span class="mono text-xs fw-600" style="color:var(--text);">${p.xwOBA.toFixed(3)}</span>
            </div>`;
          }).join("")}
        </div>
        <div>
          <div class="text-xs fw-600" style="color:var(--red);margin-bottom:6px;">Most Unlucky (xwOBA-wOBA)</div>
          ${savantBatters.filter(p => p.attempts >= 20).sort((a, b) => b.wobaDiff - a.wobaDiff).slice(0, 10).map((p, i) => {
            const isMyPlayer = myRosterNames.some(r => normalizePlayerName(r) === normalizePlayerName(p.name));
            return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
              <span class="mono text-xs" style="color:var(--text3);width:16px;">${i + 1}</span>
              <span class="text-xs truncate ${isMyPlayer ? "fw-700" : "fw-600"}" style="flex:1;color:${isMyPlayer ? "var(--accent)" : "var(--text2)"};">${escapeHtml(p.name)}</span>
              <span class="mono text-xs fw-600" style="color:var(--green);">+${p.wobaDiff.toFixed(3)}</span>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>
```

Key leaderboards:
- **Exit Velo Top 10**: 가장 세게 치는 타자 → 파워 지표
- **Barrel% Top 10**: 가장 효율적으로 치는 타자 → 퀄리티 지표
- **xwOBA Top 10**: 실력 기반 종합 지표 → 실제 상위 타자
- **Most Unlucky**: xwOBA-wOBA 차이가 큰 타자 → 반등 후보 (FA 픽업 기회)

내 팀 선수는 파란색 볼드로 하이라이트.

- [ ] **Step 2: Build + verify**

```bash
npx tsx src/scripts/weekly-report-html.ts auto
open docs/index.html
```

Expected: Activity 탭 하단에 Statcast Leaders 4개 리더보드

- [ ] **Step 3: Commit**

```bash
git add src/scripts/weekly-report-html.ts
git commit -m "feat: Activity tab - Statcast leaderboards"
```

---

### Task 5: Deploy

- [ ] **Step 1: Rebuild all weeks**

```bash
npx tsx src/scripts/weekly-report-html.ts 1
npx tsx src/scripts/weekly-report-html.ts auto
```

- [ ] **Step 2: Push to main**

```bash
git add -A
git commit -m "feat: Statcast integration - My Team + Leaders"
git push origin main
```

- [ ] **Step 3: Deploy to gh-pages**

```bash
# Copy docs + history → gh-pages → push
```

- [ ] **Step 4: Verify live site**

Visit https://soen234.github.io/fantasy-baseball-report/
- Analysis 탭: My Team Statcast (타자 xwOBA순, 투수 xwOBA순)
- Activity 탭: 4개 Statcast 리더보드

---

## Notes

- **이름 매칭**: Yahoo `"Shohei Ohtani (Pitcher)"` 같은 특수 케이스는 `normalizePlayerName`에서 괄호 제거 필요할 수 있음
- **Savant 실패 시**: `.catch(() => [])` 로 graceful degradation — "No Statcast data" 표시
- **API 부하**: Savant CSV 4개 요청 (batter statcast + expected, pitcher statcast + expected) — 병렬로 ~2초
- **GitHub Actions**: Savant은 인증 불필요, Actions에서도 바로 동작
- **Luck 컬럼**: xwOBA - wOBA > 0이면 불운(실력 대비 결과가 나쁨, 반등 기대), < 0이면 행운(하락 위험)
