#!/usr/bin/env tsx
/**
 * Weekly HTML Dashboard Report Generator
 * GitHub Pages용 시각화 대시보드
 */
import "dotenv/config";
import {
  getStandings,
  getScoreboard,
  getTransactions,
  getHotPlayers,
} from "../api/yahoo.js";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────
const LEAGUE_KEY = "469.l.18247";
const MY_TEAM_ID = "10";
const MY_TEAM_KEY = `469.l.18247.t.${MY_TEAM_ID}`;

interface StatMeta {
  abbr: string;
  name: string;
  nameKo: string;
  group: "batting" | "pitching";
  higherBetter: boolean;
  displayOnly: boolean;
}

const STAT_MAP: Record<string, StatMeta> = {
  "60": {
    abbr: "H/AB",
    name: "Hits/At Bats",
    nameKo: "안타/타수",
    group: "batting",
    higherBetter: true,
    displayOnly: true,
  },
  "7": {
    abbr: "R",
    name: "Runs",
    nameKo: "득점",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "8": {
    abbr: "H",
    name: "Hits",
    nameKo: "안타",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "12": {
    abbr: "HR",
    name: "Home Runs",
    nameKo: "홈런",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "13": {
    abbr: "RBI",
    name: "RBI",
    nameKo: "타점",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "18": {
    abbr: "BB",
    name: "Walks",
    nameKo: "볼넷",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "21": {
    abbr: "K",
    name: "Strikeouts",
    nameKo: "삼진",
    group: "batting",
    higherBetter: false,
    displayOnly: false,
  },
  "23": {
    abbr: "TB",
    name: "Total Bases",
    nameKo: "루타",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "52": {
    abbr: "A",
    name: "Assists",
    nameKo: "어시스트",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "3": {
    abbr: "AVG",
    name: "Batting Average",
    nameKo: "타율",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "4": {
    abbr: "OBP",
    name: "On-base Pct",
    nameKo: "출루율",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "5": {
    abbr: "SLG",
    name: "Slugging Pct",
    nameKo: "장타율",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "62": {
    abbr: "NSB",
    name: "Net Stolen Bases",
    nameKo: "순도루",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "66": {
    abbr: "SLAM",
    name: "Grand Slams",
    nameKo: "만루홈런",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "50": {
    abbr: "IP",
    name: "Innings Pitched",
    nameKo: "이닝",
    group: "pitching",
    higherBetter: true,
    displayOnly: true,
  },
  "28": {
    abbr: "W",
    name: "Wins",
    nameKo: "승",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "29": {
    abbr: "L",
    name: "Losses",
    nameKo: "패",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "30": {
    abbr: "CG",
    name: "Complete Games",
    nameKo: "완투",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "42": {
    abbr: "K(P)",
    name: "Strikeouts",
    nameKo: "탈삼진",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "46": {
    abbr: "GIDP",
    name: "GIDP Induced",
    nameKo: "병살타유발",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "49": {
    abbr: "TB(P)",
    name: "TB Allowed",
    nameKo: "피루타",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "26": {
    abbr: "ERA",
    name: "ERA",
    nameKo: "평균자책",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "27": {
    abbr: "WHIP",
    name: "WHIP",
    nameKo: "WHIP",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "56": {
    abbr: "K/BB",
    name: "K/BB Ratio",
    nameKo: "K/BB",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "73": {
    abbr: "RAPP",
    name: "Relief Apps",
    nameKo: "구원등판",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "83": {
    abbr: "QS",
    name: "Quality Starts",
    nameKo: "퀄리티스타트",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "90": {
    abbr: "NSVH",
    name: "Net SV+HLD",
    nameKo: "순세홀",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
};

// ─── Helpers ──────────────────────────────────
function extractTeamInfo(teamArr: any[]) {
  const flat = teamArr[0];
  let key = "",
    id = "",
    name = "";
  const managers: string[] = [];
  let moves = 0,
    waiverPriority = 0;
  for (const item of flat) {
    if (item?.team_key) key = item.team_key;
    if (item?.team_id) id = item.team_id;
    if (item?.name) name = item.name;
    if (item?.number_of_moves !== undefined) moves = item.number_of_moves;
    if (item?.waiver_priority !== undefined)
      waiverPriority = item.waiver_priority;
    if (item?.managers) {
      for (const m of item.managers) {
        if (m?.manager?.nickname) managers.push(m.manager.nickname);
      }
    }
  }
  return { key, id, name, managers, moves, waiverPriority };
}

function extractStats(teamArr: any[]): Record<string, string> {
  const stats: Record<string, string> = {};
  for (const entry of teamArr) {
    if (entry?.team_stats?.stats) {
      for (const s of entry.team_stats.stats) {
        stats[s.stat.stat_id] = s.stat.value;
      }
    }
  }
  return stats;
}

function extractStandings(teamArr: any[]) {
  for (const entry of teamArr) {
    if (entry?.team_standings) {
      const s = entry.team_standings;
      return {
        rank: parseInt(s.rank),
        wins: parseInt(s.outcome_totals.wins),
        losses: parseInt(s.outcome_totals.losses),
        ties: parseInt(s.outcome_totals.ties),
        pct: s.outcome_totals.percentage,
      };
    }
  }
  return { rank: 0, wins: 0, losses: 0, ties: 0, pct: ".000" };
}

function extractPoints(teamArr: any[]): string {
  for (const entry of teamArr) {
    if (entry?.team_points) return entry.team_points.total;
  }
  return "0";
}

function compareStats(
  v1: string,
  v2: string,
  higherBetter: boolean,
): "t1" | "t2" | "tie" {
  const n1 = parseFloat(v1) || 0;
  const n2 = parseFloat(v2) || 0;
  if (n1 === n2) return "tie";
  if (higherBetter) return n1 > n2 ? "t1" : "t2";
  return n1 < n2 ? "t1" : "t2";
}

// ─── Main ────────────────────────────────────
async function generateHtmlReport(week: number) {
  console.log(`📊 Week ${week} HTML 리포트 생성 중...`);

  const [standingsRaw, scoreboardRaw, transactionsRaw, hotBatRaw, hotPitRaw] =
    await Promise.all([
      getStandings(LEAGUE_KEY),
      getScoreboard(LEAGUE_KEY, week),
      getTransactions(LEAGUE_KEY),
      getHotPlayers(LEAGUE_KEY, "B", 3),
      getHotPlayers(LEAGUE_KEY, "P", 3),
    ]);

  // ─── Parse hot players ──────────────────────
  interface HotPlayer {
    name: string;
    team: string;
    pos: string;
    stats: Record<string, string>;
  }
  function parseHotPlayers(raw: any): HotPlayer[] {
    const result: HotPlayer[] = [];
    const players = raw?.fantasy_content?.league?.[1]?.players;
    if (!players) return result;
    for (const idx of Object.keys(players)) {
      if (idx === "count") continue;
      const p = players[idx].player;
      const info = p[0];
      let name = "",
        team = "",
        pos = "";
      for (const item of info) {
        if (item?.name?.full) name = item.name.full;
        if (item?.editorial_team_abbr) team = item.editorial_team_abbr;
        if (item?.display_position) pos = item.display_position;
      }
      const stats: Record<string, string> = {};
      if (p[1]?.player_stats?.stats) {
        for (const s of p[1].player_stats.stats) {
          stats[s.stat.stat_id] = s.stat.value;
        }
      }
      result.push({ name, team, pos, stats });
    }
    return result;
  }
  const hotBatters = parseHotPlayers(hotBatRaw);
  const hotPitchers = parseHotPlayers(hotPitRaw);
  console.log(`🔥 Hot Players: ${hotBatters.length}B + ${hotPitchers.length}P`);

  // Parse standings
  interface TeamData {
    key: string;
    id: string;
    name: string;
    managers: string[];
    moves: number;
    stats: Record<string, string>;
    standings: {
      rank: number;
      wins: number;
      losses: number;
      ties: number;
      pct: string;
    };
  }
  const teams: TeamData[] = [];
  const teamsObj = standingsRaw.fantasy_content.league[1].standings[0].teams;
  for (const idx of Object.keys(teamsObj)) {
    if (idx === "count") continue;
    const teamArr = teamsObj[idx].team;
    const info = extractTeamInfo(teamArr);
    teams.push({
      ...info,
      stats: extractStats(teamArr),
      standings: extractStandings(teamArr),
    });
  }
  teams.sort((a, b) => a.standings.rank - b.standings.rank);

  // Parse matchups
  interface CatResult {
    statId: string;
    abbr: string;
    t1Val: string;
    t2Val: string;
    winner: "t1" | "t2" | "tie";
  }
  interface MatchupData {
    t1: {
      name: string;
      key: string;
      stats: Record<string, string>;
      points: string;
    };
    t2: {
      name: string;
      key: string;
      stats: Record<string, string>;
      points: string;
    };
    cats: CatResult[];
  }
  const matchups: MatchupData[] = [];
  const matchupsObj =
    scoreboardRaw.fantasy_content.league[1].scoreboard[0].matchups;
  for (const idx of Object.keys(matchupsObj)) {
    if (idx === "count") continue;
    const m = matchupsObj[idx].matchup[0].teams;
    const t1Arr = m[0].team,
      t2Arr = m[1].team;
    const t1Info = extractTeamInfo(t1Arr),
      t2Info = extractTeamInfo(t2Arr);
    const t1Stats = extractStats(t1Arr),
      t2Stats = extractStats(t2Arr);
    const cats: CatResult[] = [];
    for (const [statId, meta] of Object.entries(STAT_MAP)) {
      if (meta.displayOnly) continue;
      cats.push({
        statId,
        abbr: meta.abbr,
        t1Val: t1Stats[statId] ?? "0",
        t2Val: t2Stats[statId] ?? "0",
        winner: compareStats(
          t1Stats[statId] ?? "0",
          t2Stats[statId] ?? "0",
          meta.higherBetter,
        ),
      });
    }
    matchups.push({
      t1: {
        name: t1Info.name,
        key: t1Info.key,
        stats: t1Stats,
        points: extractPoints(t1Arr),
      },
      t2: {
        name: t2Info.name,
        key: t2Info.key,
        stats: t2Stats,
        points: extractPoints(t2Arr),
      },
      cats,
    });
  }

  // My matchup
  const myMatch = matchups.find(
    (m) => m.t1.key === MY_TEAM_KEY || m.t2.key === MY_TEAM_KEY,
  );
  const isT1 = myMatch?.t1.key === MY_TEAM_KEY;

  // Build team weekly stats from scoreboard
  const weeklyTeamStats: Record<string, Record<string, string>> = {};
  for (const m of matchups) {
    weeklyTeamStats[m.t1.name] = m.t1.stats;
    weeklyTeamStats[m.t2.name] = m.t2.stats;
  }

  // Generic category ranking function
  type CatRankEntry = { teamName: string; value: string; rank: number };
  function computeCatRankings(
    statSource: (teamName: string, statId: string) => string,
  ): Record<string, CatRankEntry[]> {
    const rankings: Record<string, CatRankEntry[]> = {};
    for (const [statId, meta] of Object.entries(STAT_MAP)) {
      if (meta.displayOnly) continue;
      const entries = teams.map((t) => ({
        teamName: t.name,
        value: statSource(t.name, statId),
        rank: 0,
      }));
      const allValues = entries.map((e) => parseFloat(e.value) || 0);
      const allSame = allValues.every((v) => v === allValues[0]);
      if (allSame) {
        const avgRank = (teams.length + 1) / 2;
        entries.forEach((e) => (e.rank = avgRank));
      } else {
        entries.sort((a, b) => {
          const va = parseFloat(a.value) || 0,
            vb = parseFloat(b.value) || 0;
          return meta.higherBetter ? vb - va : va - vb;
        });
        let i = 0;
        while (i < entries.length) {
          let j = i;
          while (
            j < entries.length &&
            (parseFloat(entries[j].value) || 0) ===
              (parseFloat(entries[i].value) || 0)
          )
            j++;
          const avgRank = (i + 1 + j) / 2;
          for (let k = i; k < j; k++) entries[k].rank = avgRank;
          i = j;
        }
      }
      rankings[statId] = entries;
    }
    return rankings;
  }

  // Season cumulative rankings (from standings)
  const seasonCatRankings = computeCatRankings((name, sid) => {
    const t = teams.find((t) => t.name === name);
    return t?.stats[sid] ?? "0";
  });

  // Weekly rankings (from scoreboard)
  const weeklyCatRankings = computeCatRankings(
    (name, sid) => weeklyTeamStats[name]?.[sid] ?? "0",
  );

  // Default catRankings = weekly (used for roto/heatmap/radar)
  const catRankings = weeklyCatRankings;

  // ─── History: accumulate week data ──────────
  interface HistoryWeek {
    week: number;
    teams: {
      key: string;
      name: string;
      rank: number;
      wins: number;
      losses: number;
      ties: number;
      pct: string;
      rotoPoints: number;
    }[];
  }
  interface HistoryData {
    weeks: HistoryWeek[];
  }

  const historyPath = path.join(process.cwd(), "data", "history.json");
  let history: HistoryData = { weeks: [] };
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  }

  // Calculate roto points per team: sum of (numTeams + 1 - rank) across all scoring categories
  const numTeams = teams.length;
  const rotoByTeam: Record<string, number> = {};
  for (const t of teams) rotoByTeam[t.name] = 0;
  for (const [statId, meta] of Object.entries(STAT_MAP)) {
    if (meta.displayOnly) continue;
    for (const entry of catRankings[statId]) {
      rotoByTeam[entry.teamName] =
        (rotoByTeam[entry.teamName] || 0) + (numTeams + 1 - entry.rank);
    }
  }

  const weekEntry: HistoryWeek = {
    week,
    teams: teams.map((t) => ({
      key: t.key,
      name: t.name,
      rank: t.standings.rank,
      wins: t.standings.wins,
      losses: t.standings.losses,
      ties: t.standings.ties,
      pct: t.standings.pct,
      rotoPoints: rotoByTeam[t.name] || 0,
    })),
  };

  // Upsert: replace existing week or append
  const existingIdx = history.weeks.findIndex((w) => w.week === week);
  if (existingIdx >= 0) history.weeks[existingIdx] = weekEntry;
  else history.weeks.push(weekEntry);
  history.weeks.sort((a, b) => a.week - b.week);

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
  console.log(
    `📁 히스토리 저장: ${historyPath} (${history.weeks.length} weeks)`,
  );

  // My team rankings
  const myTeam = teams.find((t) => t.id === MY_TEAM_ID)!;
  const myRankings: {
    statId: string;
    abbr: string;
    nameKo: string;
    value: string;
    rank: number;
    group: string;
  }[] = [];
  for (const [statId, meta] of Object.entries(STAT_MAP)) {
    if (meta.displayOnly) continue;
    const entry = catRankings[statId].find((e) => e.teamName === myTeam.name);
    if (entry) {
      myRankings.push({
        statId,
        abbr: meta.abbr,
        nameKo: meta.nameKo,
        value: entry.value,
        rank: entry.rank,
        group: meta.group,
      });
    }
  }

  // Parse transactions
  interface TxnData {
    type: string;
    timestamp: number;
    adds: { player: string; team: string; pos: string; mlb: string }[];
    drops: { player: string; team: string; pos: string; mlb: string }[];
  }
  const transactions: TxnData[] = [];
  const txnObj = transactionsRaw.fantasy_content.league[1]?.transactions;
  if (txnObj) {
    for (const idx of Object.keys(txnObj)) {
      if (idx === "count") continue;
      const txn = txnObj[idx].transaction;
      const meta = txn[0];
      const players = txn[1]?.players;
      if (!players) continue;
      const adds: TxnData["adds"] = [],
        drops: TxnData["drops"] = [];
      for (const pidx of Object.keys(players)) {
        if (pidx === "count") continue;
        const p = players[pidx].player;
        const pInfo = p[0];
        const pTxn = p[1]?.transaction_data;
        let playerName = "",
          pos = "",
          mlb = "";
        for (const item of pInfo) {
          if (item?.name?.full) playerName = item.name.full;
          if (item?.display_position) pos = item.display_position;
          if (item?.editorial_team_abbr) mlb = item.editorial_team_abbr;
        }
        const txnData = Array.isArray(pTxn) ? pTxn[0] : pTxn;
        if (txnData?.type === "add")
          adds.push({
            player: playerName,
            team: txnData.destination_team_name,
            pos,
            mlb,
          });
        else if (txnData?.type === "drop")
          drops.push({
            player: playerName,
            team: txnData.source_team_name,
            pos,
            mlb,
          });
      }
      transactions.push({
        type: meta.type,
        timestamp: parseInt(meta.timestamp),
        adds,
        drops,
      });
    }
  }
  // 해당 주차의 트랜잭션만 필터 (시즌 시작: 3/25, 주당 7일)
  const SEASON_START = new Date("2026-03-25").getTime() / 1000;
  const weekStart = SEASON_START + (week - 1) * 7 * 86400;
  const weekEnd = SEASON_START + week * 7 * 86400;
  const weekTxns = transactions.filter(
    (t) => t.timestamp >= weekStart && t.timestamp < weekEnd,
  );

  // ─── Build HTML ────────────────────────────

  // Radar chart data
  const battingCats = myRankings.filter((r) => r.group === "batting");
  const pitchingCats = myRankings.filter((r) => r.group === "pitching");
  const radarBatLabels = battingCats.map((c) => c.abbr);
  const radarBatData = battingCats.map((c) => 13 - c.rank);
  const radarPitLabels = pitchingCats.map((c) => c.abbr);
  const radarPitData = pitchingCats.map((c) => 13 - c.rank);

  // Matchup data JSON for client-side rendering
  const matchupsJson = JSON.stringify(
    matchups.map((m, i) => {
      const t1W = m.cats.filter((c) => c.winner === "t1").length;
      const t2W = m.cats.filter((c) => c.winner === "t2").length;
      const ties = m.cats.filter((c) => c.winner === "tie").length;
      return {
        idx: i,
        t1Name: m.t1.name,
        t1Key: m.t1.key,
        t2Name: m.t2.name,
        t2Key: m.t2.key,
        t1Wins: t1W,
        t2Wins: t2W,
        ties,
        cats: m.cats.map((c) => ({
          abbr: c.abbr,
          statId: c.statId,
          group: STAT_MAP[c.statId]?.group ?? "batting",
          t1Val: c.t1Val,
          t2Val: c.t2Val,
          winner: c.winner,
        })),
      };
    }),
  );
  const myTeamKeyJson = JSON.stringify(MY_TEAM_KEY);
  const teamsJson = JSON.stringify(
    teams.map((t) => ({ key: t.key, name: t.name })),
  );

  // Category rankings per team (for dynamic radar/rankings)
  const catRankingsJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(catRankings).map(([statId, entries]) => [
        statId,
        entries.map((e) => ({
          teamName: e.teamName,
          value: e.value,
          rank: e.rank,
        })),
      ]),
    ),
  );
  // Season cumulative rankings JSON (for heatmap season toggle)
  const seasonCatRankingsJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(seasonCatRankings).map(([statId, entries]) => [
        statId,
        entries.map((e) => ({
          teamName: e.teamName,
          value: e.value,
          rank: e.rank,
        })),
      ]),
    ),
  );
  // Stat metadata for client
  const statMetaJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(STAT_MAP)
        .filter(([, m]) => !m.displayOnly)
        .map(([id, m]) => [id, { abbr: m.abbr, group: m.group }]),
    ),
  );
  // Team name by key lookup
  const teamNameByKeyJson = JSON.stringify(
    Object.fromEntries(teams.map((t) => [t.key, t.name])),
  );
  // History for trend charts
  const historyJson = JSON.stringify(history);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Week ${week} — Fantasy Baseball 2026</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0e17; --surface: #111827; --surface2: #1a2236;
      --border: rgba(255,255,255,0.06); --border-active: rgba(255,255,255,0.15);
      --text: #e2e8f0; --text2: #94a3b8; --text3: #475569;
      --accent: #3b82f6; --green: #22c55e; --red: #ef4444; --amber: #f59e0b;
      --font: 'DM Sans', system-ui, sans-serif;
      --mono: 'JetBrains Mono', monospace;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.5; -webkit-font-smoothing: antialiased; }
    .mono { font-family: var(--mono); }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
    .card-flush { background: transparent; border: 1px solid var(--border); border-radius: 12px; }

    /* Grid system */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .grid-sidebar { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
    /* Row layouts */
    .row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-sidebar, .row-2col, .hot-grid { grid-template-columns: 1fr !important; }
      .container { padding: 0 10px; }
      header .container { flex-direction: column; gap: 8px; align-items: flex-start; }
      .mg { grid-template-columns: 1fr 56px 1fr; padding: 7px 8px; font-size: 12px; }
      .cat-row { grid-template-columns: 40px 1fr auto 1fr 40px; font-size: 11px; padding: 4px 6px; }
      .rank-pill { font-size: 10px; padding: 2px 6px; }
      .ct-inner { min-width: 140px; padding: 8px 10px; }
      select { min-width: 0 !important; width: 100%; font-size: 12px; }
      .card { border-radius: 8px; }
      .scroll-y { max-height: 300px; }
      .txn-row { grid-template-columns: 40px 1fr 1fr; font-size: 11px; gap: 4px; }
    }

    /* Matchup grid */
    .mg { display: grid; grid-template-columns: 1fr 80px 1fr; align-items: center; gap: 4px; padding: 10px 14px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
    .mg:hover { background: var(--surface2); }
    .mg.active { background: var(--surface2); border: 1px solid var(--accent); }

    /* Category row */
    .cat-row { display: grid; grid-template-columns: 52px 1fr auto 1fr 52px; align-items: center; gap: 0; padding: 6px 10px; border-radius: 6px; font-size: 13px; }
    .cat-row:nth-child(odd) { background: rgba(255,255,255,0.02); }

    /* Rank bar */
    .rank-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: var(--mono); }
    .rank-pill.top { background: rgba(34,197,94,0.12); color: var(--green); }
    .rank-pill.mid { background: rgba(148,163,184,0.1); color: var(--text2); }
    .rank-pill.bot { background: rgba(239,68,68,0.1); color: var(--red); }

    /* Tabs */
    .tab-bar { display: flex; gap: 2px; background: var(--surface); border-radius: 8px; padding: 3px; border: 1px solid var(--border); }
    .tab-btn { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text3); cursor: pointer; border: none; background: none; transition: all 0.15s; white-space: nowrap; }
    .tab-btn:hover { color: var(--text2); }
    .tab-btn.active { background: var(--accent); color: white; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .main-tab { display: none; }
    .main-tab.active { display: block; }

    /* Scrollable regions */
    .scroll-y { max-height: 420px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--surface2) transparent; }
    .scroll-y::-webkit-scrollbar { width: 4px; }
    .scroll-y::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 2px; }

    /* Transaction compact */
    .txn-row { display: grid; grid-template-columns: 52px 1fr 1fr; gap: 8px; padding: 5px 10px; font-size: 12px; border-bottom: 1px solid var(--border); }
    .txn-row:last-child { border-bottom: none; }

    /* Custom tooltip */
    .ct { position: absolute; pointer-events: none; z-index: 50; opacity: 0; transition: opacity 0.15s ease, transform 0.15s ease; transform: translateY(4px); }
    .ct.show { opacity: 1; transform: translateY(0); }
    .ct-inner { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 180px; }
    .ct-title { font-family: var(--mono); font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .ct-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
    .ct-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .ct-name { font-size: 12px; color: var(--text2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ct-val { font-family: var(--mono); font-size: 12px; font-weight: 700; }
    .ct-row.highlight .ct-name { color: var(--text); }

    /* Animations */
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.35s ease-out both; }

    /* Heatmap table */
    .heatmap { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 11px; white-space: nowrap; }
    .heatmap th { padding: 6px 5px; color: var(--text3); font-weight: 600; text-align: center; border-bottom: 1px solid var(--border); font-size: 10px; line-height: 1.3; }
    .heatmap td { padding: 5px 4px; text-align: center; color: #fff; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .heatmap tr:hover td { filter: brightness(1.3); }
    .hm-team { text-align: left !important; padding-left: 8px !important; color: var(--text) !important; background: var(--surface) !important; font-family: var(--font); font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; position: sticky; left: 0; z-index: 1; }
    .heatmap thead th:first-child { position: sticky; left: 0; z-index: 2; background: var(--surface); }
    .hm-avg { font-size: 11px; min-width: 44px; }
    .hm-cat { min-width: 34px; font-size: 11px; }

    /* Select */
    select { appearance: none; background: var(--surface2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E") no-repeat right 10px center; border: 1px solid var(--border); color: var(--text); font-family: var(--font); font-size: 13px; padding: 7px 30px 7px 12px; border-radius: 8px; cursor: pointer; }
    select:focus { outline: none; border-color: var(--accent); }

    /* Utility */
    .w { color: var(--green); } .l { color: var(--red); } .t { color: var(--text3); }
    .text-xs { font-size: 11px; } .text-sm { font-size: 13px; } .text-base { font-size: 14px; }
    .fw-600 { font-weight: 600; } .fw-700 { font-weight: 700; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opacity-50 { opacity: 0.5; }
  </style>
</head>
<body>
  <!-- Header -->
  <header style="border-bottom:1px solid var(--border);padding:12px 0;">
    <div class="container" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="mono fw-700" style="font-size:18px;color:var(--accent);">FB</span>
        <!-- Week navigation -->
        <div style="display:flex;align-items:center;gap:4px;">
          ${(() => {
            const maxWeek = Math.max(week, ...history.weeks.map((w) => w.week));
            const prevDisabled = week <= 1;
            const nextDisabled = week >= maxWeek;
            return `${!prevDisabled ? `<a href="week${week - 1}.html" style="color:var(--text3);text-decoration:none;padding:4px 6px;border-radius:4px;font-size:12px;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">&lt;</a>` : `<span style="padding:4px 6px;color:var(--surface2);font-size:12px;">&lt;</span>`}
          <select id="week-select" onchange="location.href='week'+this.value+'.html'" style="min-width:80px;font-size:12px;padding:4px 24px 4px 8px;">
            ${Array.from({ length: maxWeek }, (_, i) => i + 1)
              .map(
                (w) =>
                  `<option value="${w}" ${w === week ? "selected" : ""}>Week ${w}</option>`,
              )
              .join("")}`;
          })()}
          </select>
          ${(() => {
            const maxW = Math.max(week, ...history.weeks.map((w) => w.week));
            return week < maxW
              ? `<a href="week${week + 1}.html" style="color:var(--text3);text-decoration:none;padding:4px 6px;border-radius:4px;font-size:12px;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">&gt;</a>`
              : `<span style="padding:4px 6px;color:var(--surface2);font-size:12px;">&gt;</span>`;
          })()}
        </div>
        <span class="text-xs" style="color:var(--text3);">${new Date().toLocaleDateString("ko-KR")}</span>
      </div>
      <!-- Main tabs -->
      <div id="main-tabs" class="tab-bar">
        <button class="tab-btn active" onclick="switchMainTab('overview')">Overview</button>
        <button class="tab-btn" onclick="switchMainTab('matchup')">Matchup</button>
        <button class="tab-btn" onclick="switchMainTab('analysis')">Analysis</button>
        <button class="tab-btn" onclick="switchMainTab('activity')">Activity</button>
      </div>
    </div>
  </header>

  <main class="container" style="padding-top:20px;padding-bottom:40px;">

    <!-- ═══ TAB: Overview ═══ -->
    <div id="tab-overview" class="main-tab active">

    <!-- Hot Zone: Players + Team -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px;" class="hot-grid">
      <!-- Hot Batters -->
      <div class="card fade-in" style="padding:14px;">
        <div class="text-xs fw-600" style="color:var(--amber);margin-bottom:10px;letter-spacing:1px;">🔥 HOT BATTERS <span style="color:var(--text3);font-weight:400;">Last 7d</span></div>
        ${hotBatters
          .map((p, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
            const hab = p.stats["60"] || "-";
            const hr = p.stats["12"] || "0";
            const rbi = p.stats["13"] || "0";
            const tb = p.stats["23"] || "0";
            const avg = p.stats["3"] || "-";
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;${i === 0 ? "background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);" : ""}">
            <span style="font-size:18px;">${medal}</span>
            <div style="flex:1;min-width:0;">
              <div class="text-sm fw-700 truncate">${escapeHtml(p.name)}</div>
              <div class="mono text-xs" style="color:var(--text3);">${p.team} · ${p.pos}</div>
            </div>
            <div class="mono text-xs" style="text-align:right;line-height:1.6;">
              <span style="color:var(--text);">${avg}</span> <span style="color:var(--text3);">AVG</span><br>
              <span style="color:var(--amber);">${hr}</span><span style="color:var(--text3);">HR</span> <span style="color:var(--text);">${rbi}</span><span style="color:var(--text3);">RBI</span> <span style="color:var(--text2);">${tb}</span><span style="color:var(--text3);">TB</span>
            </div>
          </div>`;
          })
          .join("\n        ")}
      </div>

      <!-- Hot Pitchers -->
      <div class="card fade-in" style="padding:14px;animation-delay:0.05s;">
        <div class="text-xs fw-600" style="color:var(--amber);margin-bottom:10px;letter-spacing:1px;">🔥 HOT PITCHERS <span style="color:var(--text3);font-weight:400;">Last 7d</span></div>
        ${hotPitchers
          .map((p, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
            const ip = p.stats["50"] || "-";
            const k = p.stats["42"] || "0";
            const era = p.stats["26"] || "-";
            const whip = p.stats["27"] || "-";
            const w = p.stats["28"] || "0";
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;${i === 0 ? "background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);" : ""}">
            <span style="font-size:18px;">${medal}</span>
            <div style="flex:1;min-width:0;">
              <div class="text-sm fw-700 truncate">${escapeHtml(p.name)}</div>
              <div class="mono text-xs" style="color:var(--text3);">${p.team} · ${p.pos}</div>
            </div>
            <div class="mono text-xs" style="text-align:right;line-height:1.6;">
              <span style="color:var(--text);">${era}</span> <span style="color:var(--text3);">ERA</span> <span style="color:var(--text2);">${whip}</span> <span style="color:var(--text3);">WHIP</span><br>
              <span style="color:var(--amber);">${w}</span><span style="color:var(--text3);">W</span> <span style="color:var(--text);">${k}</span><span style="color:var(--text3);">K</span> <span style="color:var(--text2);">${ip}</span><span style="color:var(--text3);">IP</span>
            </div>
          </div>`;
          })
          .join("\n        ")}
      </div>

      <!-- Hot Teams (this week's roto) -->
      <div class="card fade-in" style="padding:14px;animation-delay:0.1s;">
        <div class="text-xs fw-600" style="color:var(--amber);margin-bottom:10px;letter-spacing:1px;">🔥 HOT TEAMS <span style="color:var(--text3);font-weight:400;">This Week</span></div>
        ${(() => {
          // Compute weekly roto from scoreboard matchups (all team stats for this week)
          const weeklyTeamStats: Record<string, Record<string, string>> = {};
          for (const m of matchups) {
            weeklyTeamStats[m.t1.name] = m.t1.stats;
            weeklyTeamStats[m.t2.name] = m.t2.stats;
          }
          // Rank each category for this week
          const weeklyRoto: { name: string; pts: number }[] = [];
          const tNames = Object.keys(weeklyTeamStats);
          const weekRanks: Record<string, number> = {};
          for (const n of tNames) weekRanks[n] = 0;
          for (const [statId, meta] of Object.entries(STAT_MAP)) {
            if (meta.displayOnly) continue;
            const vals = tNames.map((n) => ({
              n,
              v: parseFloat(weeklyTeamStats[n]?.[statId] ?? "0") || 0,
            }));
            const allSame = vals.every((x) => x.v === vals[0].v);
            if (allSame) {
              for (const x of vals) weekRanks[x.n] += (tNames.length + 1) / 2;
            } else {
              vals.sort((a, b) => (meta.higherBetter ? b.v - a.v : a.v - b.v));
              let i = 0;
              while (i < vals.length) {
                let j = i;
                while (j < vals.length && vals[j].v === vals[i].v) j++;
                const avg = (i + 1 + j) / 2;
                for (let k = i; k < j; k++)
                  weekRanks[vals[k].n] += tNames.length + 1 - avg;
                i = j;
              }
            }
          }
          for (const n of tNames)
            weeklyRoto.push({ name: n, pts: weekRanks[n] });
          weeklyRoto.sort((a, b) => b.pts - a.pts);

          return weeklyRoto
            .slice(0, 3)
            .map((t, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
              const team = teams.find((x) => x.name === t.name);
              return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;${i === 0 ? "background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);" : ""}" ${team ? `onclick="selectTeam('${team.key}')" style="cursor:pointer;"` : ""}>
            <span style="font-size:18px;">${medal}</span>
            <div style="flex:1;min-width:0;">
              <div class="text-sm fw-700 truncate">${escapeHtml(t.name)}</div>
              <div class="mono text-xs" style="color:var(--text3);">${team ? team.standings.wins + "W-" + team.standings.losses + "L-" + team.standings.ties + "T" : ""}</div>
            </div>
            <div class="mono text-sm fw-700" style="color:var(--amber);">${t.pts.toFixed(1)}<span class="text-xs" style="color:var(--text3);"> pts</span></div>
          </div>`;
            })
            .join("\n        ");
        })()}
      </div>
    </div>

    <!-- Standings (H2H + Roto) -->
    <div class="row-2col" style="margin-bottom:20px;">
      <div class="card fade-in" style="padding:16px;">
        <div id="board-tabs" class="tab-bar" style="margin-bottom:10px;">
          <button class="tab-btn active" onclick="switchBoard('h2h')">H2H</button>
          <button class="tab-btn" onclick="switchBoard('roto')">Roto</button>
        </div>
        <div id="board-h2h" class="tab-content active">
          ${teams
            .map((t, i) => {
              const rankColor =
                i === 0
                  ? "var(--amber)"
                  : i < 3
                    ? "var(--text2)"
                    : "var(--text3)";
              return `<div data-team-key="${t.key}" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;" onclick="selectTeam('${t.key}')">
              <span class="mono fw-700 text-sm" style="color:${rankColor};width:18px;text-align:right;">${t.standings.rank}</span>
              <span class="text-sm truncate fw-600" style="flex:1;color:var(--text);">${escapeHtml(t.name)}</span>
              <span class="mono text-xs" style="color:var(--text2);">${t.standings.pct}</span>
              <span class="mono text-xs" style="color:var(--text3);width:52px;text-align:right;">${t.standings.wins}-${t.standings.losses}-${t.standings.ties}</span>
            </div>`;
            })
            .join("\n          ")}
        </div>
        <div id="board-roto" class="tab-content">
          ${[...teams]
            .map((t) => ({ ...t, roto: rotoByTeam[t.name] || 0 }))
            .sort((a, b) => b.roto - a.roto)
            .map((t, i) => {
              const rankColor =
                i === 0
                  ? "var(--amber)"
                  : i < 3
                    ? "var(--text2)"
                    : "var(--text3)";
              const rotoStr = Number.isInteger(t.roto)
                ? String(t.roto)
                : t.roto.toFixed(1);
              return `<div data-team-key="${t.key}" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;" onclick="selectTeam('${t.key}')">
              <span class="mono fw-700 text-sm" style="color:${rankColor};width:18px;text-align:right;">${i + 1}</span>
              <span class="text-sm truncate fw-600" style="flex:1;color:var(--text);">${escapeHtml(t.name)}</span>
              <span class="mono text-xs fw-700" style="color:var(--accent);">${rotoStr}</span>
              <span class="mono text-xs" style="color:var(--text3);width:52px;text-align:right;">${t.standings.wins}-${t.standings.losses}-${t.standings.ties}</span>
            </div>`;
            })
            .join("\n          ")}
        </div>
      </div>

      <!-- Trend Charts stacked -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="card fade-in" style="padding:14px;">
          <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">H2H Rank Trend</div>
          <div style="position:relative;height:320px;"><canvas id="chartRank"></canvas></div>
        </div>
        <div class="card fade-in" style="padding:14px;">
          <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Roto Points Trend</div>
          <div style="position:relative;height:320px;"><canvas id="chartRoto"></canvas></div>
        </div>
      </div>
    </div>

    </div><!-- /tab-overview -->

    <!-- ═══ TAB: Matchup ═══ -->
    <div id="tab-matchup" class="main-tab">

    <!-- Team selector + Matchup Detail -->
    <div style="margin-bottom:16px;">
      <select id="matchup-select" style="min-width:240px;"></select>
    </div>
    <div class="grid-sidebar fade-in" style="margin-bottom:20px;">
      <div class="card" style="padding:16px;">
        <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">All Matchups</div>
        <div id="matchup-cards">
          ${matchups
            .map((m, mi) => {
              const t1W = m.cats.filter((c) => c.winner === "t1").length;
              const t2W = m.cats.filter((c) => c.winner === "t2").length;
              const ties = m.cats.filter((c) => c.winner === "tie").length;
              const t1Won = t1W > t2W;
              const draw = t1W === t2W;
              return `<div class="mg matchup-card" data-idx="${mi}">
              <div style="text-align:right;" class="text-sm truncate fw-600 ${t1Won ? "w" : draw ? "" : "opacity-50"}">${escapeHtml(m.t1.name)}</div>
              <div class="mono fw-700 text-sm" style="text-align:center;">
                <span class="${t1Won ? "w" : ""}">${t1W}</span><span style="color:var(--text3);margin:0 3px;">-</span><span class="${!t1Won && !draw ? "w" : ""}">${t2W}</span><span style="color:var(--text3);margin:0 3px;">-</span><span class="t">${ties}</span>
              </div>
              <div class="text-sm truncate fw-600 ${!t1Won && !draw ? "w" : draw ? "" : "opacity-50"}">${escapeHtml(m.t2.name)}</div>
            </div>`;
            })
            .join("\n          ")}
        </div>
      </div>
      <div class="card" style="padding:20px;" id="matchup-detail">
        <div id="matchup-header" style="margin-bottom:16px;"></div>
        <div id="matchup-cats" class="grid-2" style="gap:12px;"></div>
      </div>
    </div>

    </div><!-- /tab-matchup -->

    <!-- ═══ TAB: Analysis ═══ -->
    <div id="tab-analysis" class="main-tab">

    <div style="margin-bottom:16px;">
      <select id="analysis-team-select" style="min-width:240px;"></select>
    </div>

    <!-- Radar + Rankings -->
    <div class="row-2col" style="margin-bottom:20px;">
      <!-- Radar Charts -->
      <div class="card fade-in" style="padding:16px;animation-delay:0.1s;">
        <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Category Radar</div>
        <div class="grid-2" style="gap:12px;">
          <div>
            <div class="text-xs fw-600" style="color:var(--accent);text-align:center;margin-bottom:4px;">Batting</div>
            <div style="position:relative;height:200px;">
              <canvas id="radarBat"></canvas>
            </div>
          </div>
          <div>
            <div class="text-xs fw-600" style="color:#a78bfa;text-align:center;margin-bottom:4px;">Pitching</div>
            <div style="position:relative;height:200px;">
              <canvas id="radarPit"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Category Rankings (dynamic) -->
      <div class="card fade-in" style="padding:16px;animation-delay:0.15s;">
        <div class="text-xs fw-600" style="color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;" id="rankings-title">Rankings</div>
        <div class="grid-2" style="gap:4px 16px;" id="rankings-body"></div>
      </div>
    </div>

    <!-- Heatmap Tables -->
    ${(() => {
      const battingIds = Object.entries(STAT_MAP)
        .filter(([, m]) => !m.displayOnly && m.group === "batting")
        .map(([id]) => id);
      const pitchingIds = Object.entries(STAT_MAP)
        .filter(([, m]) => !m.displayOnly && m.group === "pitching")
        .map(([id]) => id);
      const allIds = Object.entries(STAT_MAP)
        .filter(([, m]) => !m.displayOnly)
        .map(([id]) => id);

      const hmRows = teams.map((t) => {
        const ranks: Record<string, number> = {};
        for (const sid of allIds) {
          const entry = catRankings[sid].find((e) => e.teamName === t.name);
          ranks[sid] = entry ? entry.rank : 6.5;
        }
        const batAvg =
          battingIds.reduce((s, id) => s + ranks[id], 0) / battingIds.length;
        const pitAvg =
          pitchingIds.reduce((s, id) => s + ranks[id], 0) / pitchingIds.length;
        const allAvg =
          allIds.reduce((s, id) => s + ranks[id], 0) / allIds.length;
        return { name: t.name, key: t.key, ranks, batAvg, pitAvg, allAvg };
      });

      // Season cumulative rows
      const seasonHmRows = teams.map((t) => {
        const ranks: Record<string, number> = {};
        for (const sid of allIds) {
          const entry = seasonCatRankings[sid].find(
            (e) => e.teamName === t.name,
          );
          ranks[sid] = entry ? entry.rank : 6.5;
        }
        const batAvg =
          battingIds.reduce((s, id) => s + ranks[id], 0) / battingIds.length;
        const pitAvg =
          pitchingIds.reduce((s, id) => s + ranks[id], 0) / pitchingIds.length;
        const allAvg =
          allIds.reduce((s, id) => s + ranks[id], 0) / allIds.length;
        return { name: t.name, key: t.key, ranks, batAvg, pitAvg, allAvg };
      });

      function hmc(rank: number): string {
        const p = (rank - 1) / 11;
        const h = (1 - p) * 120;
        const s = 65 + p * 10;
        const l = 25 + (1 - Math.abs(p - 0.5) * 2) * 8;
        return `hsl(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%)`;
      }
      function fr(r: number): string {
        return Number.isInteger(r) ? String(r) : r.toFixed(1);
      }
      function abbr(sid: string): string {
        const m = STAT_MAP[sid];
        return m.group === "pitching" && (m.abbr === "K" || m.abbr === "TB")
          ? m.abbr + "(P)"
          : m.abbr;
      }

      type HmRow = (typeof hmRows)[0];
      function buildTable(
        rows: HmRow[],
        ids: string[],
        sortKey: "allAvg" | "batAvg" | "pitAvg",
        avgLabel: string,
      ) {
        const sorted = [...rows].sort((a, b) => a[sortKey] - b[sortKey]);
        let h = `<table class="heatmap"><thead><tr><th class="hm-team">Team</th><th class="hm-avg">${avgLabel}</th>`;
        for (const sid of ids) h += `<th class="hm-cat">${abbr(sid)}</th>`;
        h += `</tr></thead><tbody>`;
        for (const r of sorted) {
          h += `<tr onclick="selectTeam('${r.key}')" style="cursor:pointer;" data-team-key="${r.key}">`;
          h += `<td class="hm-team">${escapeHtml(r.name)}</td>`;
          h += `<td class="hm-avg" style="background:${hmc(r[sortKey])};"><b>${r[sortKey].toFixed(2)}</b></td>`;
          for (const sid of ids) {
            h += `<td class="hm-cat" style="background:${hmc(r.ranks[sid])};">${fr(r.ranks[sid])}</td>`;
          }
          h += `</tr>`;
        }
        h += `</tbody></table>`;
        return h;
      }

      function buildOverview(rows: HmRow[]) {
        const sorted = [...rows].sort((a, b) => a.allAvg - b.allAvg);
        let h = `<table class="heatmap"><thead><tr><th class="hm-team">Team</th><th class="hm-avg">AVG<br>Rank</th><th class="hm-avg">BAT<br>Avg</th><th class="hm-avg">PIT<br>Avg</th></tr></thead><tbody>`;
        for (const r of sorted) {
          h += `<tr onclick="selectTeam('${r.key}')" style="cursor:pointer;" data-team-key="${r.key}">`;
          h += `<td class="hm-team">${escapeHtml(r.name)}</td>`;
          h += `<td class="hm-avg" style="background:${hmc(r.allAvg)};"><b>${r.allAvg.toFixed(2)}</b></td>`;
          h += `<td class="hm-avg" style="background:${hmc(r.batAvg)};">${r.batAvg.toFixed(2)}</td>`;
          h += `<td class="hm-avg" style="background:${hmc(r.pitAvg)};">${r.pitAvg.toFixed(2)}</td>`;
          h += `</tr>`;
        }
        h += `</tbody></table>`;
        return h;
      }

      return `
    <div class="card fade-in" style="padding:16px;margin-bottom:20px;animation-delay:0.18s;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div class="text-xs fw-600" style="color:var(--text3);text-transform:uppercase;letter-spacing:1px;">Category Heatmap</div>
        <div id="hm-scope" class="tab-bar" style="margin-left:8px;">
          <button class="tab-btn active" onclick="switchHeatmapScope('weekly')">Weekly</button>
          <button class="tab-btn" onclick="switchHeatmapScope('season')">Season</button>
        </div>
        <div id="hm-tabs" class="tab-bar" style="margin-left:auto;">
          <button class="tab-btn active" onclick="switchHeatmap('overview')">Overview</button>
          <button class="tab-btn" onclick="switchHeatmap('bat')">Batting</button>
          <button class="tab-btn" onclick="switchHeatmap('pit')">Pitching</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <!-- Weekly -->
        <div id="hm-weekly" class="tab-content active">
          <div id="hm-overview" class="tab-content active">${buildOverview(hmRows)}</div>
          <div id="hm-bat" class="tab-content">${buildTable(hmRows, battingIds, "batAvg", "BAT<br>Avg")}</div>
          <div id="hm-pit" class="tab-content">${buildTable(hmRows, pitchingIds, "pitAvg", "PIT<br>Avg")}</div>
        </div>
        <!-- Season -->
        <div id="hm-season" class="tab-content">
          <div id="hm-s-overview" class="tab-content active">${buildOverview(seasonHmRows)}</div>
          <div id="hm-s-bat" class="tab-content">${buildTable(seasonHmRows, battingIds, "batAvg", "BAT<br>Avg")}</div>
          <div id="hm-s-pit" class="tab-content">${buildTable(seasonHmRows, pitchingIds, "pitAvg", "PIT<br>Avg")}</div>
        </div>
      </div>
    </div>`;
    })()}

    </div><!-- /tab-analysis -->

    <!-- ═══ TAB: Activity ═══ -->
    <div id="tab-activity" class="main-tab">

    <div class="card fade-in" style="padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="text-xs fw-600" style="color:var(--text3);text-transform:uppercase;letter-spacing:1px;">Transactions</div>
        <span class="mono text-xs" style="color:var(--text3);">${weekTxns.length}건</span>
      </div>
      ${
        weekTxns.length === 0
          ? `<div class="text-sm" style="color:var(--text3);">None</div>`
          : `<div class="scroll-y" style="max-height:600px;">
          ${weekTxns
            .map((txn) => {
              const date = new Date(txn.timestamp * 1000).toLocaleDateString(
                "ko-KR",
                { month: "numeric", day: "numeric" },
              );
              const team = txn.adds[0]?.team || txn.drops[0]?.team || "?";
              const addStr =
                txn.adds
                  .map(
                    (a) =>
                      `<span class="w">${escapeHtml(a.player)}</span> <span style="color:var(--text3);">${a.mlb} ${a.pos}</span>`,
                  )
                  .join(", ") || "";
              const dropStr =
                txn.drops
                  .map(
                    (d) =>
                      `<span class="l">${escapeHtml(d.player)}</span> <span style="color:var(--text3);">${d.mlb} ${d.pos}</span>`,
                  )
                  .join(", ") || "";
              return `<div style="display:grid;grid-template-columns:44px 140px 1fr 1fr;gap:8px;padding:7px 10px;font-size:12px;border-bottom:1px solid var(--border);align-items:center;">
              <span style="color:var(--text3);">${date}</span>
              <span class="fw-600 truncate" style="color:var(--text2);">${escapeHtml(team)}</span>
              <div>${addStr ? "+" + addStr : ""}</div>
              <div>${dropStr ? "-" + dropStr : ""}</div>
            </div>`;
            })
            .join("\n          ")}
        </div>`
      }
    </div>

    </div><!-- /tab-activity -->

  </main>

  <script>
    // Data
    var MATCHUPS = ${matchupsJson};
    var TEAMS = ${teamsJson};
    var MY_KEY = ${myTeamKeyJson};
    var CAT_RANKINGS = ${catRankingsJson};
    var SEASON_CAT_RANKINGS = ${seasonCatRankingsJson};
    var STAT_META = ${statMetaJson};
    var TEAM_NAMES = ${teamNameByKeyJson};
    var sel = document.getElementById('matchup-select');
    var selAnalysis = document.getElementById('analysis-team-select');
    var STORAGE_KEY = 'fb-selected-team';

    // Populate both selects
    function populateSelect(selectEl) {
      TEAMS.forEach(function(t) {
        var o = document.createElement('option');
        o.value = t.key; o.textContent = t.name;
        if (t.key === MY_KEY) o.selected = true;
        selectEl.appendChild(o);
      });
    }
    populateSelect(sel);
    populateSelect(selAnalysis);

    // Radar charts (stored for dynamic update)
    // Radar tooltip
    function radarTooltip(context) {
      var chart = context.chart;
      var tooltip = context.tooltip;
      var el = chart.canvas.parentNode.querySelector('.ct');
      if (!el) { el = document.createElement('div'); el.className = 'ct'; chart.canvas.parentNode.appendChild(el); }
      if (tooltip.opacity === 0) { el.classList.remove('show'); return; }
      var items = tooltip.dataPoints || [];
      var inner = '<div class="ct-inner">';
      items.forEach(function(pt) {
        var label = pt.label || '';
        var score = pt.raw;
        var rank = 13 - score;
        inner += '<div class="ct-row highlight">';
        inner += '<span class="ct-name">' + label + '</span>';
        inner += '<span class="ct-val" style="color:var(--accent);">#' + rank + '</span>';
        inner += '</div>';
      });
      inner += '</div>';
      el.replaceChildren();
      var tmp = document.createElement('div'); tmp.innerHTML = inner;
      while (tmp.firstChild) el.appendChild(tmp.firstChild);
      el.style.left = tooltip.caretX + 'px';
      el.style.top = tooltip.caretY + 'px';
      el.classList.add('show');
    }
    var ro = { responsive:true, maintainAspectRatio:false, scales:{r:{min:0,max:12,ticks:{display:false,stepSize:3},grid:{color:'rgba(148,163,184,0.08)'},pointLabels:{color:'#64748b',font:{size:10,weight:'600',family:'JetBrains Mono'}},angleLines:{color:'rgba(148,163,184,0.05)'}}},plugins:{legend:{display:false},tooltip:{enabled:false,external:radarTooltip}} };
    var batLabels = ${JSON.stringify(radarBatLabels)};
    var pitLabels = ${JSON.stringify(radarPitLabels)};
    var chartBat = new Chart(document.getElementById('radarBat'),{type:'radar',data:{labels:batLabels,datasets:[{data:${JSON.stringify(radarBatData)},backgroundColor:'rgba(59,130,246,0.1)',borderColor:'rgba(59,130,246,0.6)',borderWidth:1.5,pointBackgroundColor:'#3b82f6',pointRadius:3}]},options:ro});
    var chartPit = new Chart(document.getElementById('radarPit'),{type:'radar',data:{labels:pitLabels,datasets:[{data:${JSON.stringify(radarPitData)},backgroundColor:'rgba(167,139,250,0.1)',borderColor:'rgba(167,139,250,0.6)',borderWidth:1.5,pointBackgroundColor:'#a78bfa',pointRadius:3}]},options:ro});

    // Trend charts
    var HISTORY = ${historyJson};
    var weekLabels = HISTORY.weeks.map(function(w) { return 'W' + w.week; });

    // Custom external tooltip handler
    function externalTooltip(context) {
      var chart = context.chart;
      var tooltip = context.tooltip;
      var el = chart.canvas.parentNode.querySelector('.ct');
      if (!el) {
        el = document.createElement('div');
        el.className = 'ct';
        chart.canvas.parentNode.appendChild(el);
      }
      if (tooltip.opacity === 0) {
        el.classList.remove('show');
        return;
      }
      // Sort items by value for rank charts (selected team first otherwise)
      var items = tooltip.dataPoints || [];
      // Build rows — only show teams with visible data (pointRadius > 0 or borderWidth > 1.5)
      var rows = [];
      items.forEach(function(pt) {
        var ds = chart.data.datasets[pt.datasetIndex];
        if (pt.raw === null || pt.raw === undefined) return;
        var isHighlight = ds.borderWidth > 1.5;
        var color = isHighlight ? ds.borderColor : 'var(--text3)';
        rows.push({ name: ds.label, value: pt.formattedValue, color: color, highlight: isHighlight, raw: pt.raw });
      });
      // Only show highlighted team + sort others by value
      var highlighted = rows.filter(function(r) { return r.highlight; });
      var others = rows.filter(function(r) { return !r.highlight; });
      // For rank: sort ascending (lower is better). For roto: sort descending
      var isRank = chart.options.scales && chart.options.scales.y && chart.options.scales.y.reverse;
      others.sort(function(a, b) { return isRank ? a.raw - b.raw : b.raw - a.raw; });
      // Show all teams sorted
      var display = highlighted.concat(others);
      display.sort(function(a, b) { return isRank ? a.raw - b.raw : b.raw - a.raw; });

      var inner = '<div class="ct-inner" style="max-height:320px;overflow-y:auto;">';
      inner += '<div class="ct-title">' + (tooltip.title[0] || '') + '</div>';
      display.forEach(function(r, i) {
        var hl = r.highlight ? ' highlight' : '';
        inner += '<div class="ct-row' + hl + '">';
        inner += '<span class="mono text-xs" style="color:var(--text3);width:16px;">' + (i+1) + '</span>';
        inner += '<div class="ct-dot" style="background:' + r.color + ';"></div>';
        inner += '<span class="ct-name">' + r.name + '</span>';
        inner += '<span class="ct-val" style="color:' + r.color + ';">' + r.value + '</span>';
        inner += '</div>';
      });
      inner += '</div>';
      el.replaceChildren();
      var tmp = document.createElement('div');
      tmp.innerHTML = inner;
      while (tmp.firstChild) el.appendChild(tmp.firstChild);

      el.style.left = tooltip.caretX + 'px';
      el.style.top = tooltip.caretY + 'px';
      el.classList.add('show');
    }

    var trendLineOpts = {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(148,163,184,0.05)' }, ticks: { color: '#64748b', font: { size: 10, family: 'JetBrains Mono' } } },
        y: { grid: { color: 'rgba(148,163,184,0.08)' }, ticks: { color: '#64748b', font: { size: 10, family: 'JetBrains Mono' }, stepSize: 1 } }
      },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', font: { size: 9, family: 'DM Sans' }, boxWidth: 10, padding: 6, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: { enabled: false, external: externalTooltip }
      },
      interaction: { mode: 'index', intersect: false },
      elements: { point: { radius: 3, hoverRadius: 5 }, line: { tension: 0.3 } }
    };

    var rankOpts = JSON.parse(JSON.stringify(trendLineOpts));
    rankOpts.scales.y.reverse = true;
    rankOpts.scales.y.min = 1;
    rankOpts.scales.y.max = 12;
    rankOpts.plugins.tooltip = { enabled: false, external: externalTooltip };
    rankOpts.plugins.legend = trendLineOpts.plugins.legend;

    var rotoOpts = JSON.parse(JSON.stringify(trendLineOpts));
    rotoOpts.plugins.tooltip = { enabled: false, external: externalTooltip };
    rotoOpts.plugins.legend = trendLineOpts.plugins.legend;

    function getTeamTrendData(teamKey, field) {
      return HISTORY.weeks.map(function(w) {
        var t = w.teams.find(function(t) { return t.key === teamKey; });
        return t ? t[field] : null;
      });
    }

    // Team color palette (consistent per team index)
    var TEAM_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a78bfa','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];
    function teamColor(teamKey) {
      var idx = TEAMS.findIndex(function(t) { return t.key === teamKey; });
      return TEAM_COLORS[idx % TEAM_COLORS.length];
    }

    // Initialize with selected team + all others as faint background
    function buildTrendDatasets(teamKey, field) {
      var datasets = [];
      TEAMS.forEach(function(t) {
        var color = teamColor(t.key);
        var isSelected = t.key === teamKey;
        datasets.push({
          label: t.name,
          data: getTeamTrendData(t.key, field),
          borderColor: isSelected ? color : color + '99',
          backgroundColor: isSelected ? color + '1a' : 'transparent',
          borderWidth: isSelected ? 3 : 1.5,
          pointRadius: isSelected ? 5 : 2.5,
          pointBackgroundColor: color,
          tension: 0.3,
          fill: isSelected,
          order: isSelected ? 0 : 1,
        });
      });
      return datasets;
    }

    var chartRank = new Chart(document.getElementById('chartRank'), {
      type: 'line',
      data: { labels: weekLabels, datasets: buildTrendDatasets(MY_KEY, 'rank') },
      options: rankOpts,
    });
    var chartRoto = new Chart(document.getElementById('chartRoto'), {
      type: 'line',
      data: { labels: weekLabels, datasets: buildTrendDatasets(MY_KEY, 'rotoPoints') },
      options: rotoOpts,
    });

    function updateTrend(teamKey) {
      chartRank.data.datasets = buildTrendDatasets(teamKey, 'rank');
      chartRank.update();
      chartRoto.data.datasets = buildTrendDatasets(teamKey, 'rotoPoints');
      chartRoto.update();
    }

    function findMatchupByTeam(k) { return MATCHUPS.findIndex(function(m){return m.t1Key===k||m.t2Key===k;}); }

    function renderMatchup(idx) {
      var m = MATCHUPS[idx];
      var t1Won = m.t1Wins > m.t2Wins, draw = m.t1Wins === m.t2Wins;

      // Header
      var h = document.getElementById('matchup-header');
      h.replaceChildren();
      var row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;';

      var l = document.createElement('div');
      l.style.textAlign = 'right';
      var ln = document.createElement('div');
      ln.className = 'text-base fw-700';
      ln.style.color = t1Won ? 'var(--green)' : draw ? 'var(--text)' : 'var(--text3)';
      ln.textContent = m.t1Name;
      l.appendChild(ln);

      var c = document.createElement('div');
      c.className = 'mono fw-700';
      c.style.cssText = 'text-align:center;font-size:28px;letter-spacing:2px;';
      var cs1 = document.createElement('span');
      cs1.style.color = t1Won ? 'var(--green)' : draw ? 'var(--text)' : 'var(--text3)';
      cs1.textContent = m.t1Wins;
      var cd = document.createElement('span');
      cd.style.cssText = 'color:var(--text3);margin:0 8px;font-size:20px;';
      cd.textContent = ':';
      var cs2 = document.createElement('span');
      cs2.style.color = !t1Won&&!draw ? 'var(--green)' : draw ? 'var(--text)' : 'var(--text3)';
      cs2.textContent = m.t2Wins;
      var ct = document.createElement('span');
      ct.style.cssText = 'color:var(--text3);margin-left:8px;font-size:14px;';
      ct.textContent = '(T:'+m.ties+')';
      c.append(cs1,cd,cs2,ct);

      var r = document.createElement('div');
      var rn = document.createElement('div');
      rn.className = 'text-base fw-700';
      rn.style.color = !t1Won&&!draw ? 'var(--green)' : draw ? 'var(--text)' : 'var(--text3)';
      rn.textContent = m.t2Name;
      r.appendChild(rn);

      row.append(l,c,r);
      h.appendChild(row);

      // Cats
      var ce = document.getElementById('matchup-cats');
      ce.replaceChildren();

      function buildGroup(label, cats) {
        var col = document.createElement('div');
        var title = document.createElement('div');
        title.className = 'text-xs fw-600';
        title.style.cssText = 'color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;';
        title.textContent = label;
        col.appendChild(title);
        cats.forEach(function(cat) {
          var cr = document.createElement('div');
          cr.className = 'cat-row';
          var t1Win = cat.winner==='t1', t2Win = cat.winner==='t2', tie = cat.winner==='tie';

          var v1 = document.createElement('span');
          v1.className = 'mono text-sm fw-600';
          v1.style.cssText = 'text-align:right;color:'+(t1Win?'var(--green)':tie?'var(--text2)':'var(--text3)')+';';
          v1.textContent = cat.t1Val;

          var bar1 = document.createElement('div');
          bar1.style.cssText = 'height:2px;background:'+(t1Win?'var(--green)':'transparent')+';border-radius:1px;margin:0 4px;';

          var ab = document.createElement('span');
          ab.className = 'mono text-xs fw-600';
          ab.style.cssText = 'text-align:center;color:var(--text3);';
          ab.textContent = cat.abbr;

          var bar2 = document.createElement('div');
          bar2.style.cssText = 'height:2px;background:'+(t2Win?'var(--green)':'transparent')+';border-radius:1px;margin:0 4px;';

          var v2 = document.createElement('span');
          v2.className = 'mono text-sm fw-600';
          v2.style.cssText = 'color:'+(t2Win?'var(--green)':tie?'var(--text2)':'var(--text3)')+';';
          v2.textContent = cat.t2Val;

          cr.append(v1,bar1,ab,bar2,v2);
          col.appendChild(cr);
        });
        return col;
      }

      ce.append(
        buildGroup('Batting', m.cats.filter(function(c){return c.group==='batting';})),
        buildGroup('Pitching', m.cats.filter(function(c){return c.group==='pitching';}))
      );

      // Highlight card
      document.querySelectorAll('.matchup-card').forEach(function(card) {
        var ci = parseInt(card.dataset.idx);
        if (ci===idx) { card.classList.add('active'); } else { card.classList.remove('active'); }
      });
    }

    // Get rankings for a team by key
    function getTeamRankings(teamKey) {
      var teamName = TEAM_NAMES[teamKey];
      var results = [];
      for (var statId in STAT_META) {
        var meta = STAT_META[statId];
        var rankings = CAT_RANKINGS[statId];
        if (!rankings) continue;
        var entry = rankings.find(function(e) { return e.teamName === teamName; });
        if (entry) results.push({ statId: statId, abbr: meta.abbr, group: meta.group, value: entry.value, rank: entry.rank });
      }
      return results;
    }

    // Update radar charts for selected team (match label order)
    function updateRadar(teamKey) {
      var rankings = getTeamRankings(teamKey);
      var rMap = {};
      rankings.forEach(function(r) { rMap[r.abbr] = 13 - r.rank; });
      chartBat.data.datasets[0].data = batLabels.map(function(l) { return rMap[l] || 0; });
      chartBat.update();
      chartPit.data.datasets[0].data = pitLabels.map(function(l) { return rMap[l] || 0; });
      chartPit.update();
    }

    // Update rankings pills for selected team
    function updateRankings(teamKey) {
      var rankings = getTeamRankings(teamKey);
      var body = document.getElementById('rankings-body');
      body.replaceChildren();
      rankings.forEach(function(r) {
        var tier = r.rank <= 3 ? 'top' : r.rank >= 10 ? 'bot' : 'mid';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;';
        var label = document.createElement('span');
        label.className = 'mono text-xs fw-600';
        label.style.cssText = 'color:var(--text2);width:44px;';
        label.textContent = r.abbr;
        var pill = document.createElement('span');
        pill.className = 'rank-pill ' + tier;
        pill.textContent = '#' + r.rank + ' ' + r.value;
        row.append(label, pill);
        body.appendChild(row);
      });
      // Update title
      var teamName = TEAM_NAMES[teamKey];
      document.getElementById('rankings-title').textContent = (teamName || 'Rankings') + ' Rankings';
    }

    // Highlight selected team in standings
    function highlightStandings(teamKey) {
      document.querySelectorAll('[data-team-key]').forEach(function(el) {
        if (el.dataset.teamKey === teamKey) {
          el.style.background = 'rgba(59,130,246,0.08)';
          el.style.border = '1px solid rgba(59,130,246,0.2)';
        } else {
          el.style.background = '';
          el.style.border = '';
        }
      });
    }

    // Main tab switching
    var mainTabNames = ['overview','matchup','analysis','activity'];
    function switchMainTab(tab) {
      mainTabNames.forEach(function(t) {
        var el = document.getElementById('tab-' + t);
        if (el) el.classList.toggle('active', t === tab);
      });
      var btns = document.getElementById('main-tabs').querySelectorAll('.tab-btn');
      mainTabNames.forEach(function(t, i) {
        btns[i].classList.toggle('active', t === tab);
      });
    }

    // Board tabs (H2H / Roto)
    function switchBoard(tab) {
      document.getElementById('board-h2h').classList.toggle('active', tab === 'h2h');
      document.getElementById('board-roto').classList.toggle('active', tab === 'roto');
      var btns = document.getElementById('board-tabs').querySelectorAll('.tab-btn');
      btns[0].classList.toggle('active', tab === 'h2h');
      btns[1].classList.toggle('active', tab === 'roto');
    }

    var hmCurrentScope = 'weekly';
    var hmCurrentTab = 'overview';

    function switchHeatmapScope(scope) {
      hmCurrentScope = scope;
      document.getElementById('hm-weekly').classList.toggle('active', scope === 'weekly');
      document.getElementById('hm-season').classList.toggle('active', scope === 'season');
      var btns = document.getElementById('hm-scope').querySelectorAll('.tab-btn');
      btns[0].classList.toggle('active', scope === 'weekly');
      btns[1].classList.toggle('active', scope === 'season');
      // Re-apply current tab within scope
      switchHeatmap(hmCurrentTab);
    }

    function switchHeatmap(tab) {
      hmCurrentTab = tab;
      var prefix = hmCurrentScope === 'weekly' ? 'hm-' : 'hm-s-';
      ['overview','bat','pit'].forEach(function(t) {
        var el = document.getElementById(prefix + t);
        if (el) el.classList.toggle('active', t === tab);
      });
      var btns = document.getElementById('hm-tabs').querySelectorAll('.tab-btn');
      btns[0].classList.toggle('active', tab === 'overview');
      btns[1].classList.toggle('active', tab === 'bat');
      btns[2].classList.toggle('active', tab === 'pit');
    }

    function selectTeam(k) {
      sel.value = k;
      selAnalysis.value = k;
      var i = findMatchupByTeam(k);
      if (i >= 0) renderMatchup(i);
      updateRadar(k);
      updateRankings(k);
      highlightStandings(k);
      updateTrend(k);
      try { localStorage.setItem(STORAGE_KEY, k); } catch(e) {}
    }

    sel.addEventListener('change', function(){selectTeam(sel.value);});
    selAnalysis.addEventListener('change', function(){selectTeam(selAnalysis.value);});
    document.querySelectorAll('.matchup-card').forEach(function(card){
      card.addEventListener('click', function(){
        var m = MATCHUPS[parseInt(card.dataset.idx)];
        selectTeam(m.t1Key);
        document.getElementById('matchup-detail').scrollIntoView({behavior:'smooth',block:'nearest'});
      });
    });

    // Restore from localStorage or default to MY_KEY
    var savedTeam = null;
    try { savedTeam = localStorage.getItem(STORAGE_KEY); } catch(e) {}
    if (savedTeam && TEAM_NAMES[savedTeam]) {
      selectTeam(savedTeam);
    } else {
      selectTeam(MY_KEY);
    }
  </script>
</body>
</html>`;

  // Save
  const docsDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const indexPath = path.join(docsDir, "index.html");
  const weekPath = path.join(docsDir, `week${week}.html`);
  fs.writeFileSync(weekPath, html, "utf-8");
  fs.writeFileSync(indexPath, html, "utf-8"); // latest always at index

  // Generate week index page
  const weekFiles = fs
    .readdirSync(docsDir)
    .filter((f) => f.match(/^week\d+\.html$/))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""));
      const nb = parseInt(b.replace(/\D/g, ""));
      return na - nb;
    });
  const indexPageHtml = generateIndexPage(weekFiles, week);
  fs.writeFileSync(path.join(docsDir, "weeks.html"), indexPageHtml, "utf-8");

  console.log("✅ HTML 리포트 저장:");
  console.log("   " + weekPath);
  console.log("   " + indexPath + " (최신 → index)");
}

function generateIndexPage(weekFiles: string[], currentWeek: number): string {
  const links = weekFiles
    .map((f) => {
      const wk = f.replace("week", "").replace(".html", "");
      return (
        '      <a href="' +
        f +
        '" class="block px-8 py-4 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 transition-all hover:scale-105"><span class="text-lg font-bold">Week ' +
        wk +
        "</span></a>"
      );
    })
    .join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="ko">',
    "<head>",
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "  <title>Fantasy Baseball 2026 — All Weeks</title>",
    '  <script src="https://cdn.tailwindcss.com"><\/script>',
    '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
    "  <style>body { background: #0f172a; }</style>",
    "</head>",
    '<body class="text-slate-200 font-sans min-h-screen flex items-center justify-center">',
    '  <div class="text-center">',
    '    <h1 class="text-4xl font-extrabold mb-8" style="background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Fantasy Baseball 2026</h1>',
    '    <div class="space-y-3">',
    links,
    "    </div>",
    '    <p class="mt-8 text-slate-600 text-sm">Latest: <a href="index.html" class="text-blue-400 hover:underline">Week ' +
      currentWeek +
      "</a></p>",
    "  </div>",
    "</body>",
    "</html>",
  ].join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveWeek(): Promise<number> {
  const arg = process.argv[2];
  if (arg && arg !== "auto") return parseInt(arg);
  // Auto-detect: fetch league info to get current matchup_week
  const { yahooApi } = await import("../api/yahoo.js");
  const data = await yahooApi(`/league/${LEAGUE_KEY}/metadata`);
  const league = data.fantasy_content.league[0];
  const current = parseInt(league.current_week);
  console.log(
    `📅 Auto-detected: current_week=${current}, matchup_week=${league.matchup_week}`,
  );
  return current;
}

resolveWeek()
  .then((week) => generateHtmlReport(week))
  .catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
