#!/usr/bin/env tsx
/**
 * Weekly Report Generator
 * 주간 리포트: 순위, 매치업 결과, 카테고리 분석, 트랜잭션 요약
 */
import "dotenv/config";
import {
  getStandings,
  getScoreboard,
  getTransactions,
  getRoster,
  yahooApi,
} from "../api/yahoo.js";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────
const LEAGUE_KEY = "469.l.18247";
const MY_TEAM_ID = "10"; // 🏆 ProfeSuh
const MY_TEAM_KEY = `469.l.18247.t.${MY_TEAM_ID}`;

// stat_id → { abbr, name, group, sort_order, display_only }
interface StatMeta {
  abbr: string;
  name: string;
  group: "batting" | "pitching";
  higherBetter: boolean;
  displayOnly: boolean;
}

const STAT_MAP: Record<string, StatMeta> = {
  "60": {
    abbr: "H/AB",
    name: "Hits/At Bats",
    group: "batting",
    higherBetter: true,
    displayOnly: true,
  },
  "7": {
    abbr: "R",
    name: "Runs",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "8": {
    abbr: "H",
    name: "Hits",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "12": {
    abbr: "HR",
    name: "Home Runs",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "13": {
    abbr: "RBI",
    name: "RBI",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "18": {
    abbr: "BB",
    name: "Walks",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "21": {
    abbr: "K",
    name: "Strikeouts",
    group: "batting",
    higherBetter: false,
    displayOnly: false,
  },
  "23": {
    abbr: "TB",
    name: "Total Bases",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "52": {
    abbr: "A",
    name: "Assists",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "3": {
    abbr: "AVG",
    name: "Batting Average",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "4": {
    abbr: "OBP",
    name: "On-base Pct",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "5": {
    abbr: "SLG",
    name: "Slugging Pct",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "62": {
    abbr: "NSB",
    name: "Net Stolen Bases",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "66": {
    abbr: "SLAM",
    name: "Grand Slams",
    group: "batting",
    higherBetter: true,
    displayOnly: false,
  },
  "50": {
    abbr: "IP",
    name: "Innings Pitched",
    group: "pitching",
    higherBetter: true,
    displayOnly: true,
  },
  "28": {
    abbr: "W",
    name: "Wins",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "29": {
    abbr: "L",
    name: "Losses",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "30": {
    abbr: "CG",
    name: "Complete Games",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "42": {
    abbr: "K",
    name: "Strikeouts (P)",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "46": {
    abbr: "GIDP",
    name: "GIDP Induced",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "49": {
    abbr: "TB",
    name: "TB Allowed",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "26": {
    abbr: "ERA",
    name: "ERA",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "27": {
    abbr: "WHIP",
    name: "WHIP",
    group: "pitching",
    higherBetter: false,
    displayOnly: false,
  },
  "56": {
    abbr: "K/BB",
    name: "K/BB Ratio",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "73": {
    abbr: "RAPP",
    name: "Relief Apps",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "83": {
    abbr: "QS",
    name: "Quality Starts",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
  "90": {
    abbr: "NSVH",
    name: "Net SV+HLD",
    group: "pitching",
    higherBetter: true,
    displayOnly: false,
  },
};

// Yahoo JSON 파싱 헬퍼
function extractTeamInfo(teamArr: any[]): {
  key: string;
  id: string;
  name: string;
  managers: string[];
} {
  const flat = teamArr[0];
  let key = "",
    id = "",
    name = "";
  const managers: string[] = [];
  for (const item of flat) {
    if (item?.team_key) key = item.team_key;
    if (item?.team_id) id = item.team_id;
    if (item?.name) name = item.name;
    if (item?.managers) {
      for (const m of item.managers) {
        if (m?.manager?.nickname) managers.push(m.manager.nickname);
      }
    }
  }
  return { key, id, name, managers };
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

function extractStandings(teamArr: any[]): {
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pct: string;
} {
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

interface TeamData {
  key: string;
  id: string;
  name: string;
  managers: string[];
  stats: Record<string, string>;
  standings: {
    rank: number;
    wins: number;
    losses: number;
    ties: number;
    pct: string;
  };
}

interface MatchupData {
  team1: {
    name: string;
    key: string;
    stats: Record<string, string>;
    points: string;
  };
  team2: {
    name: string;
    key: string;
    stats: Record<string, string>;
    points: string;
  };
  winner?: string;
  catResults: {
    statId: string;
    abbr: string;
    t1Val: string;
    t2Val: string;
    winner: "t1" | "t2" | "tie";
  }[];
}

function compareStatValues(
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
async function generateWeeklyReport(week: number) {
  console.log(`📊 Week ${week} 리포트 생성 중...`);

  // 1) Fetch data
  const [standingsRaw, scoreboardRaw, transactionsRaw] = await Promise.all([
    getStandings(LEAGUE_KEY),
    getScoreboard(LEAGUE_KEY, week),
    getTransactions(LEAGUE_KEY),
  ]);

  // 2) Parse standings
  const standingsTeams: TeamData[] = [];
  const teamsObj = standingsRaw.fantasy_content.league[1].standings[0].teams;
  for (const idx of Object.keys(teamsObj)) {
    if (idx === "count") continue;
    const teamArr = teamsObj[idx].team;
    const info = extractTeamInfo(teamArr);
    const stats = extractStats(teamArr);
    const standings = extractStandings(teamArr);
    standingsTeams.push({ ...info, stats, standings });
  }
  standingsTeams.sort((a, b) => a.standings.rank - b.standings.rank);

  // 3) Parse scoreboard matchups
  const matchups: MatchupData[] = [];
  const matchupsObj =
    scoreboardRaw.fantasy_content.league[1].scoreboard[0].matchups;
  for (const idx of Object.keys(matchupsObj)) {
    if (idx === "count") continue;
    const matchup = matchupsObj[idx].matchup[0].teams;
    const t1Arr = matchup[0].team;
    const t2Arr = matchup[1].team;

    const t1Info = extractTeamInfo(t1Arr);
    const t2Info = extractTeamInfo(t2Arr);
    const t1Stats = extractStats(t1Arr);
    const t2Stats = extractStats(t2Arr);
    const t1Points = extractPoints(t1Arr);
    const t2Points = extractPoints(t2Arr);

    const catResults: MatchupData["catResults"] = [];
    for (const [statId, meta] of Object.entries(STAT_MAP)) {
      if (meta.displayOnly) continue;
      const v1 = t1Stats[statId] ?? "0";
      const v2 = t2Stats[statId] ?? "0";
      catResults.push({
        statId,
        abbr:
          meta.group === "pitching" && (meta.abbr === "K" || meta.abbr === "TB")
            ? `${meta.abbr}(P)`
            : meta.abbr,
        t1Val: v1,
        t2Val: v2,
        winner: compareStatValues(v1, v2, meta.higherBetter),
      });
    }

    matchups.push({
      team1: {
        name: t1Info.name,
        key: t1Info.key,
        stats: t1Stats,
        points: t1Points,
      },
      team2: {
        name: t2Info.name,
        key: t2Info.key,
        stats: t2Stats,
        points: t2Points,
      },
      catResults,
    });
  }

  // 4) Parse transactions
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

      const adds: TxnData["adds"] = [];
      const drops: TxnData["drops"] = [];

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

        // transaction_data can be array or object
        const txnData = Array.isArray(pTxn) ? pTxn[0] : pTxn;
        if (txnData?.type === "add") {
          adds.push({
            player: playerName,
            team: txnData.destination_team_name,
            pos,
            mlb,
          });
        } else if (txnData?.type === "drop") {
          drops.push({
            player: playerName,
            team: txnData.source_team_name,
            pos,
            mlb,
          });
        }
      }

      transactions.push({
        type: meta.type,
        timestamp: parseInt(meta.timestamp),
        adds,
        drops,
      });
    }
  }

  // 5) Find my matchup
  const myMatchup = matchups.find(
    (m) => m.team1.key === MY_TEAM_KEY || m.team2.key === MY_TEAM_KEY,
  );

  // 6) League-wide category rankings (for each scoring cat, rank all 12 teams)
  const catRankings: Record<
    string,
    { teamName: string; value: string; rank: number }[]
  > = {};
  for (const [statId, meta] of Object.entries(STAT_MAP)) {
    if (meta.displayOnly) continue;
    const entries = standingsTeams.map((t) => ({
      teamName: t.name,
      value: t.stats[statId] ?? "0",
      rank: 0,
    }));
    entries.sort((a, b) => {
      const va = parseFloat(a.value) || 0;
      const vb = parseFloat(b.value) || 0;
      return meta.higherBetter ? vb - va : va - vb;
    });
    entries.forEach((e, i) => (e.rank = i + 1));
    catRankings[statId] = entries;
  }

  // 7) Generate markdown report
  const now = new Date();
  const lines: string[] = [];
  const ln = (...args: string[]) => lines.push(args.join(""));

  ln(`# Week ${week} Report — 리그 네이밍 후원 환영합니다`);
  ln(`> Generated: ${now.toLocaleString("ko-KR")} | Season 2026`);
  ln("");

  // ─── 순위표 ───
  ln("## 📊 리그 순위");
  ln("");
  ln("| # | 팀 | W | L | T | PCT | 매니저 |");
  ln("|---:|:---|---:|---:|---:|:---:|:---|");
  for (const t of standingsTeams) {
    const isMe = t.id === MY_TEAM_ID;
    const mark = isMe ? " **👈**" : "";
    ln(
      `| ${t.standings.rank} | ${t.name}${mark} | ${t.standings.wins} | ${t.standings.losses} | ${t.standings.ties} | ${t.standings.pct} | ${t.managers.join(", ")} |`,
    );
  }
  ln("");

  // ─── 내 매치업 ───
  if (myMatchup) {
    const isTeam1 = myMatchup.team1.key === MY_TEAM_KEY;
    const me = isTeam1 ? myMatchup.team1 : myMatchup.team2;
    const opp = isTeam1 ? myMatchup.team2 : myMatchup.team1;
    const myWins = myMatchup.catResults.filter(
      (c) => c.winner === (isTeam1 ? "t1" : "t2"),
    ).length;
    const oppWins = myMatchup.catResults.filter(
      (c) => c.winner === (isTeam1 ? "t2" : "t1"),
    ).length;
    const ties = myMatchup.catResults.filter((c) => c.winner === "tie").length;
    const result = myWins > oppWins ? "WIN" : myWins < oppWins ? "LOSS" : "TIE";
    const emoji = result === "WIN" ? "🟢" : result === "LOSS" ? "🔴" : "🟡";

    ln(`## ${emoji} 내 매치업: ${me.name} vs ${opp.name}`);
    ln(`> **${result}** ${myWins}-${oppWins}-${ties}`);
    ln("");

    // 타격 카테고리
    ln("### 타격");
    ln("");
    ln("| Cat | 나 | 상대 | 결과 |");
    ln("|:---:|---:|---:|:---:|");
    for (const c of myMatchup.catResults) {
      const meta = Object.values(STAT_MAP).find(
        (m) =>
          c.abbr ===
          (m.group === "pitching" && (m.abbr === "K" || m.abbr === "TB")
            ? `${m.abbr}(P)`
            : m.abbr),
      );
      if (!meta || meta.group !== "batting") continue;
      const myVal = isTeam1 ? c.t1Val : c.t2Val;
      const oppVal = isTeam1 ? c.t2Val : c.t1Val;
      const myWin = c.winner === (isTeam1 ? "t1" : "t2");
      const isTie = c.winner === "tie";
      const icon = isTie ? "➖" : myWin ? "✅" : "❌";
      ln(`| ${c.abbr} | ${myVal} | ${oppVal} | ${icon} |`);
    }
    ln("");

    // 투구 카테고리
    ln("### 투구");
    ln("");
    ln("| Cat | 나 | 상대 | 결과 |");
    ln("|:---:|---:|---:|:---:|");
    for (const c of myMatchup.catResults) {
      const statMeta = STAT_MAP[c.statId];
      if (!statMeta || statMeta.group !== "pitching") continue;
      const myVal = isTeam1 ? c.t1Val : c.t2Val;
      const oppVal = isTeam1 ? c.t2Val : c.t1Val;
      const myWin = c.winner === (isTeam1 ? "t1" : "t2");
      const isTie = c.winner === "tie";
      const icon = isTie ? "➖" : myWin ? "✅" : "❌";
      ln(`| ${c.abbr} | ${myVal} | ${oppVal} | ${icon} |`);
    }
    ln("");
  }

  // ─── 전체 매치업 결과 ───
  ln("## 🏟️ 전체 매치업 결과");
  ln("");
  for (const m of matchups) {
    const t1Wins = m.catResults.filter((c) => c.winner === "t1").length;
    const t2Wins = m.catResults.filter((c) => c.winner === "t2").length;
    const ties = m.catResults.filter((c) => c.winner === "tie").length;
    const winner =
      t1Wins > t2Wins ? m.team1.name : t2Wins > t1Wins ? m.team2.name : "DRAW";
    const emoji = t1Wins > t2Wins ? "◀" : t2Wins > t1Wins ? "▶" : "=";
    ln(
      `- **${m.team1.name}** ${t1Wins} ${emoji} ${t2Wins} **${m.team2.name}** (T: ${ties})`,
    );
  }
  ln("");

  // ─── 카테고리 리그 랭킹 (내 팀 위치) ───
  ln("## 📈 카테고리별 리그 랭킹 (내 팀)");
  ln("");
  ln("### 타격");
  ln("");
  ln("| Cat | 값 | 순위 | 리그 1위 |");
  ln("|:---:|---:|:---:|:---|");
  for (const [statId, meta] of Object.entries(STAT_MAP)) {
    if (meta.displayOnly || meta.group !== "batting") continue;
    const rankings = catRankings[statId];
    const myEntry = rankings.find(
      (e) =>
        e.teamName === standingsTeams.find((t) => t.id === MY_TEAM_ID)?.name,
    );
    const leader = rankings[0];
    if (myEntry) {
      const rankEmoji =
        myEntry.rank <= 3 ? "🟢" : myEntry.rank >= 10 ? "🔴" : "🟡";
      ln(
        `| ${meta.abbr} | ${myEntry.value} | ${rankEmoji} ${myEntry.rank}/12 | ${leader.teamName} (${leader.value}) |`,
      );
    }
  }
  ln("");

  ln("### 투구");
  ln("");
  ln("| Cat | 값 | 순위 | 리그 1위 |");
  ln("|:---:|---:|:---:|:---|");
  for (const [statId, meta] of Object.entries(STAT_MAP)) {
    if (meta.displayOnly || meta.group !== "pitching") continue;
    const rankings = catRankings[statId];
    const myEntry = rankings.find(
      (e) =>
        e.teamName === standingsTeams.find((t) => t.id === MY_TEAM_ID)?.name,
    );
    const leader = rankings[0];
    if (myEntry) {
      const rankEmoji =
        myEntry.rank <= 3 ? "🟢" : myEntry.rank >= 10 ? "🔴" : "🟡";
      ln(
        `| ${meta.abbr} | ${myEntry.value} | ${rankEmoji} ${myEntry.rank}/12 | ${leader.teamName} (${leader.value}) |`,
      );
    }
  }
  ln("");

  // ─── 트랜잭션 ───
  ln("## 🔄 주요 트랜잭션");
  ln("");
  // week 1 시작일 (3/25) ~ 현재까지의 트랜잭션만
  const weekStart = new Date("2026-03-25").getTime() / 1000;
  const weekTxns = transactions.filter((t) => t.timestamp >= weekStart);
  if (weekTxns.length === 0) {
    ln("_이번 주 트랜잭션 없음_");
  } else {
    ln("| 날짜 | 팀 | Add | Drop |");
    ln("|:---:|:---|:---|:---|");
    for (const txn of weekTxns) {
      const date = new Date(txn.timestamp * 1000).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
      });
      const addStr =
        txn.adds.map((a) => `${a.player} (${a.mlb}, ${a.pos})`).join(", ") ||
        "-";
      const dropStr =
        txn.drops.map((d) => `${d.player} (${d.mlb}, ${d.pos})`).join(", ") ||
        "-";
      const team = txn.adds[0]?.team || txn.drops[0]?.team || "?";
      ln(`| ${date} | ${team} | ${addStr} | ${dropStr} |`);
    }
  }
  ln("");

  // ─── 활동량 랭킹 ───
  ln("## 🏃 팀별 활동량");
  ln("");
  const moveRanking = standingsTeams
    .map((t) => {
      let moves = 0;
      const flat = standingsRaw.fantasy_content.league[1].standings[0].teams;
      for (const idx of Object.keys(flat)) {
        if (idx === "count") continue;
        const team = flat[idx].team[0];
        let tid = "";
        for (const item of team) {
          if (item?.team_id) tid = item.team_id;
        }
        if (tid === t.id) {
          for (const item of team) {
            if (item?.number_of_moves !== undefined)
              moves = item.number_of_moves;
          }
        }
      }
      return { name: t.name, moves };
    })
    .sort((a, b) => b.moves - a.moves);

  ln("| 팀 | Moves |");
  ln("|:---|---:|");
  for (const t of moveRanking) {
    ln(`| ${t.name} | ${t.moves} |`);
  }
  ln("");

  // ─── 인사이트 ───
  ln(`## 💡 Week ${week} 인사이트`);
  ln("");

  // 내 팀 강점/약점 분석
  if (myMatchup) {
    const myTeamData = standingsTeams.find((t) => t.id === MY_TEAM_ID);
    if (myTeamData) {
      const strengths: string[] = [];
      const weaknesses: string[] = [];
      for (const [statId, meta] of Object.entries(STAT_MAP)) {
        if (meta.displayOnly) continue;
        const rankings = catRankings[statId];
        const myEntry = rankings.find((e) => e.teamName === myTeamData.name);
        if (myEntry) {
          const label =
            meta.group === "pitching" &&
            (meta.abbr === "K" || meta.abbr === "TB")
              ? `${meta.abbr}(P)`
              : meta.abbr;
          if (myEntry.rank <= 3)
            strengths.push(`${label} (${myEntry.rank}위, ${myEntry.value})`);
          if (myEntry.rank >= 10)
            weaknesses.push(`${label} (${myEntry.rank}위, ${myEntry.value})`);
        }
      }

      if (strengths.length > 0) {
        ln(`**강점 카테고리** (Top 3): ${strengths.join(", ")}`);
        ln("");
      }
      if (weaknesses.length > 0) {
        ln(`**약점 카테고리** (Bottom 3): ${weaknesses.join(", ")}`);
        ln("");
      }
    }
  }

  ln("---");
  ln(`_Generated by fantasy_baseball CLI | Week ${week} | 2026 Season_`);

  // 8) Save
  const outPath = path.join(
    process.cwd(),
    "data",
    `week${week}-report-2026.md`,
  );
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`✅ 리포트 저장: ${outPath}`);
  console.log(lines.join("\n"));
}

// CLI
const week = parseInt(process.argv[2] || "1");
generateWeeklyReport(week).catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
