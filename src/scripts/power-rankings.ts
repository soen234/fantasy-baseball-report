#!/usr/bin/env tsx
/**
 * Power Rankings Generator
 * 카테고리별 리그 순위를 합산하여 종합 파워 랭킹을 산출합니다.
 * Roto 포인트 + W/L 승률 + 카테고리 순위 합산 → 가중 평균
 *
 * Usage: npx tsx src/scripts/power-rankings.ts [week]
 */
import "dotenv/config";
import { getStandings, getScoreboard, yahooApi } from "../api/yahoo.js";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────
const LEAGUE_KEY = "469.l.18247";
const MY_TEAM_ID = "10";
const NUM_TEAMS = 12;

// 스코어링 카테고리 (display-only 제외)
interface StatMeta {
  abbr: string;
  name: string;
  group: "batting" | "pitching";
  higherBetter: boolean;
}

const SCORING_CATS: Record<string, StatMeta> = {
  "7": { abbr: "R", name: "Runs", group: "batting", higherBetter: true },
  "8": { abbr: "H", name: "Hits", group: "batting", higherBetter: true },
  "12": { abbr: "HR", name: "Home Runs", group: "batting", higherBetter: true },
  "13": { abbr: "RBI", name: "RBI", group: "batting", higherBetter: true },
  "18": { abbr: "BB", name: "Walks", group: "batting", higherBetter: true },
  "21": {
    abbr: "K",
    name: "Strikeouts",
    group: "batting",
    higherBetter: false,
  },
  "23": {
    abbr: "TB",
    name: "Total Bases",
    group: "batting",
    higherBetter: true,
  },
  "52": { abbr: "A", name: "Assists", group: "batting", higherBetter: true },
  "3": {
    abbr: "AVG",
    name: "Batting Average",
    group: "batting",
    higherBetter: true,
  },
  "4": {
    abbr: "OBP",
    name: "On-base Pct",
    group: "batting",
    higherBetter: true,
  },
  "5": {
    abbr: "SLG",
    name: "Slugging Pct",
    group: "batting",
    higherBetter: true,
  },
  "62": {
    abbr: "NSB",
    name: "Net Stolen Bases",
    group: "batting",
    higherBetter: true,
  },
  "66": {
    abbr: "SLAM",
    name: "Grand Slams",
    group: "batting",
    higherBetter: true,
  },
  "28": { abbr: "W", name: "Wins", group: "pitching", higherBetter: true },
  "29": { abbr: "L", name: "Losses", group: "pitching", higherBetter: false },
  "30": {
    abbr: "CG",
    name: "Complete Games",
    group: "pitching",
    higherBetter: true,
  },
  "42": {
    abbr: "K(P)",
    name: "Strikeouts (P)",
    group: "pitching",
    higherBetter: true,
  },
  "46": {
    abbr: "GIDP",
    name: "GIDP Induced",
    group: "pitching",
    higherBetter: true,
  },
  "49": {
    abbr: "TB(P)",
    name: "TB Allowed",
    group: "pitching",
    higherBetter: false,
  },
  "26": { abbr: "ERA", name: "ERA", group: "pitching", higherBetter: false },
  "27": { abbr: "WHIP", name: "WHIP", group: "pitching", higherBetter: false },
  "56": {
    abbr: "K/BB",
    name: "K/BB Ratio",
    group: "pitching",
    higherBetter: true,
  },
  "73": {
    abbr: "RAPP",
    name: "Relief Apps",
    group: "pitching",
    higherBetter: true,
  },
  "83": {
    abbr: "QS",
    name: "Quality Starts",
    group: "pitching",
    higherBetter: true,
  },
  "90": {
    abbr: "NSVH",
    name: "Net SV+HLD",
    group: "pitching",
    higherBetter: true,
  },
};

// ─── 가중치 ──────────────────────────────────
const WEIGHTS = {
  catRankSum: 0.5, // 카테고리 순위 합산 (낮을수록 좋음)
  winPct: 0.3, // H2H 승률
  rotoPoints: 0.2, // Roto 포인트
};

// ─── Yahoo 파싱 헬퍼 ─────────────────────────
function extractTeamBasicInfo(teamArr: any[]): {
  key: string;
  id: string;
  name: string;
} {
  const flat = teamArr[0];
  let key = "",
    id = "",
    name = "";
  for (const item of flat) {
    if (item?.team_key) key = item.team_key;
    if (item?.team_id) id = item.team_id;
    if (item?.name) name = item.name;
  }
  return { key, id, name };
}

function extractTeamStats(teamArr: any[]): Record<string, string> {
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

function extractWinLoss(teamArr: any[]): {
  wins: number;
  losses: number;
  ties: number;
  pct: number;
} {
  for (const entry of teamArr) {
    if (entry?.team_standings) {
      const s = entry.team_standings;
      return {
        wins: parseInt(s.outcome_totals.wins),
        losses: parseInt(s.outcome_totals.losses),
        ties: parseInt(s.outcome_totals.ties),
        pct: parseFloat(s.outcome_totals.percentage),
      };
    }
  }
  return { wins: 0, losses: 0, ties: 0, pct: 0 };
}

// ─── 파워 스코어 계산 ────────────────────────
interface TeamPowerData {
  key: string;
  id: string;
  name: string;
  stats: Record<string, string>;
  record: { wins: number; losses: number; ties: number; pct: number };
  catRankSum: number; // 모든 카테고리 순위의 합 (낮을수록 강팀)
  catRanks: Record<string, number>; // 카테고리별 순위
  powerScore: number;
  powerRank: number;
  tier: string;
}

function calculateCatRanks(
  teams: { id: string; name: string; stats: Record<string, string> }[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const [statId, meta] of Object.entries(SCORING_CATS)) {
    const sorted = [...teams]
      .map((t) => ({ id: t.id, val: parseFloat(t.stats[statId] || "0") }))
      .sort((a, b) => (meta.higherBetter ? b.val - a.val : a.val - b.val));

    sorted.forEach((entry, idx) => {
      if (!result[entry.id]) result[entry.id] = {};
      result[entry.id][statId] = idx + 1;
    });
  }

  return result;
}

function assignTier(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.25) return "S";
  if (pct <= 0.5) return "A";
  if (pct <= 0.75) return "B";
  return "C";
}

// ─── 트렌드 분석 ─────────────────────────────
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

function loadHistory(): HistoryWeek[] {
  const histPath = path.join(process.cwd(), "data", "history.json");
  if (!fs.existsSync(histPath)) return [];
  const data = JSON.parse(fs.readFileSync(histPath, "utf-8"));
  return data.weeks || [];
}

function getRankTrend(
  history: HistoryWeek[],
  teamKey: string,
): { week: number; rank: number }[] {
  return history.map((w) => {
    const team = w.teams.find((t) => t.key === teamKey);
    return { week: w.week, rank: team?.rank ?? 0 };
  });
}

function trendArrow(current: number, previous: number): string {
  const diff = previous - current; // positive = improved
  if (diff > 2) return "⬆️⬆️";
  if (diff > 0) return "⬆️";
  if (diff < -2) return "⬇️⬇️";
  if (diff < 0) return "⬇️";
  return "➡️";
}

// ─── Main ────────────────────────────────────
async function generatePowerRankings(week: number) {
  console.log(`⚡ Power Rankings (Week ${week}) 생성 중...`);

  // 1) Standings 가져오기
  const standingsRaw = await getStandings(LEAGUE_KEY);
  const teamsObj = standingsRaw.fantasy_content.league[1].standings[0].teams;

  const teams: {
    key: string;
    id: string;
    name: string;
    stats: Record<string, string>;
    record: { wins: number; losses: number; ties: number; pct: number };
    rotoPoints: number;
  }[] = [];

  for (const idx of Object.keys(teamsObj)) {
    if (idx === "count") continue;
    const teamArr = teamsObj[idx].team;
    const info = extractTeamBasicInfo(teamArr);
    const stats = extractTeamStats(teamArr);
    const record = extractWinLoss(teamArr);

    // rotoPoints from standings
    let rotoPoints = 0;
    for (const entry of teamArr) {
      if (entry?.team_standings?.points_for !== undefined) {
        rotoPoints = parseFloat(entry.team_standings.points_for);
      }
    }

    teams.push({ ...info, stats, record, rotoPoints });
  }

  // 2) 카테고리별 순위 계산
  const catRanksMap = calculateCatRanks(teams);

  // 3) 파워 스코어 계산
  const maxRoto = Math.max(...teams.map((t) => t.rotoPoints));
  const minCatSum = Object.keys(SCORING_CATS).length * 1; // best possible sum
  const maxCatSum = Object.keys(SCORING_CATS).length * NUM_TEAMS; // worst possible sum

  const powerTeams: TeamPowerData[] = teams.map((t) => {
    const catRanks = catRanksMap[t.id] || {};
    const catRankSum = Object.values(catRanks).reduce((sum, r) => sum + r, 0);

    // 정규화 (0~100)
    const catScore = ((maxCatSum - catRankSum) / (maxCatSum - minCatSum)) * 100;
    const winPctScore = t.record.pct * 100;
    const rotoScore = maxRoto > 0 ? (t.rotoPoints / maxRoto) * 100 : 0;

    const powerScore =
      catScore * WEIGHTS.catRankSum +
      winPctScore * WEIGHTS.winPct +
      rotoScore * WEIGHTS.rotoPoints;

    return {
      key: t.key,
      id: t.id,
      name: t.name,
      stats: t.stats,
      record: t.record,
      catRankSum,
      catRanks,
      powerScore,
      powerRank: 0,
      tier: "",
    };
  });

  // 순위 정렬
  powerTeams.sort((a, b) => b.powerScore - a.powerScore);
  powerTeams.forEach((t, i) => {
    t.powerRank = i + 1;
    t.tier = assignTier(t.powerRank, NUM_TEAMS);
  });

  // 4) 히스토리에서 트렌드 로드
  const history = loadHistory();

  // 5) 마크다운 생성
  const lines: string[] = [];
  const ln = (...args: string[]) => lines.push(args.join(""));

  ln(`# ⚡ Power Rankings — Week ${week}`);
  ln(`> Generated: ${new Date().toLocaleString("ko-KR")} | Season 2026`);
  ln(
    `> 산출 방식: 카테고리 순위 합산(${WEIGHTS.catRankSum * 100}%) + H2H 승률(${WEIGHTS.winPct * 100}%) + Roto 포인트(${WEIGHTS.rotoPoints * 100}%)`,
  );
  ln("");

  // ─── 종합 파워 랭킹 테이블 ───
  ln("## 종합 파워 랭킹");
  ln("");
  ln("| # | Tier | 팀 | Score | W-L-T | Cat합산 | Trend |");
  ln("|---:|:---:|:---|---:|:---:|---:|:---:|");

  for (const t of powerTeams) {
    const isMe = t.id === MY_TEAM_ID;
    const mark = isMe ? " **👈**" : "";
    const tierEmoji =
      t.tier === "S"
        ? "🏆"
        : t.tier === "A"
          ? "🥇"
          : t.tier === "B"
            ? "🥈"
            : "🥉";

    // 트렌드
    const trend = getRankTrend(history, t.key);
    let trendStr = "—";
    if (trend.length >= 2) {
      const prev = trend[trend.length - 1].rank;
      const arrow = trendArrow(t.powerRank, prev);
      trendStr = arrow;
    }

    ln(
      `| ${t.powerRank} | ${tierEmoji} ${t.tier} | ${t.name}${mark} | ${t.powerScore.toFixed(1)} | ${t.record.wins}-${t.record.losses}-${t.record.ties} | ${t.catRankSum} | ${trendStr} |`,
    );
  }
  ln("");

  // ─── 카테고리 프로파일 (내 팀) ───
  const myTeam = powerTeams.find((t) => t.id === MY_TEAM_ID);
  if (myTeam) {
    ln(`## 📋 내 팀 카테고리 프로파일: ${myTeam.name}`);
    ln("");

    // 타격
    ln("### 타격");
    ln("");
    ln("| Cat | 값 | 순위 | 등급 |");
    ln("|:---:|---:|:---:|:---:|");
    for (const [statId, meta] of Object.entries(SCORING_CATS)) {
      if (meta.group !== "batting") continue;
      const rank = myTeam.catRanks[statId] ?? "?";
      const val = myTeam.stats[statId] ?? "-";
      const grade =
        typeof rank === "number"
          ? rank <= 3
            ? "🟢"
            : rank >= 10
              ? "🔴"
              : "🟡"
          : "❓";
      ln(`| ${meta.abbr} | ${val} | ${rank}/${NUM_TEAMS} | ${grade} |`);
    }
    ln("");

    // 투구
    ln("### 투구");
    ln("");
    ln("| Cat | 값 | 순위 | 등급 |");
    ln("|:---:|---:|:---:|:---:|");
    for (const [statId, meta] of Object.entries(SCORING_CATS)) {
      if (meta.group !== "pitching") continue;
      const rank = myTeam.catRanks[statId] ?? "?";
      const val = myTeam.stats[statId] ?? "-";
      const grade =
        typeof rank === "number"
          ? rank <= 3
            ? "🟢"
            : rank >= 10
              ? "🔴"
              : "🟡"
          : "❓";
      ln(`| ${meta.abbr} | ${val} | ${rank}/${NUM_TEAMS} | ${grade} |`);
    }
    ln("");

    // 강점/약점 요약
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    for (const [statId, meta] of Object.entries(SCORING_CATS)) {
      const rank = myTeam.catRanks[statId];
      if (rank <= 3) strengths.push(`${meta.abbr} (${rank}위)`);
      if (rank >= 10) weaknesses.push(`${meta.abbr} (${rank}위)`);
    }

    if (strengths.length > 0) {
      ln(`**🟢 강점**: ${strengths.join(", ")}`);
      ln("");
    }
    if (weaknesses.length > 0) {
      ln(`**🔴 약점**: ${weaknesses.join(", ")}`);
      ln("");
    }

    // 전략 제안
    ln("### 💡 전략 제안");
    ln("");
    if (weaknesses.length > 0) {
      ln(
        `- 약점 카테고리(${weaknesses.slice(0, 3).join(", ")})를 보강할 FA/트레이드를 검토하세요`,
      );
    }
    if (strengths.length >= 3) {
      ln(
        `- 강점이 풍부합니다. 잉여 카테고리를 트레이드 자산으로 활용할 수 있습니다`,
      );
    }
    ln("");
  }

  // ─── Tier별 분석 ───
  ln("## 📊 Tier 분석");
  ln("");
  for (const tier of ["S", "A", "B", "C"]) {
    const tierTeams = powerTeams.filter((t) => t.tier === tier);
    if (tierTeams.length === 0) continue;
    const tierLabel =
      tier === "S"
        ? "🏆 S-Tier (챔피언 후보)"
        : tier === "A"
          ? "🥇 A-Tier (강팀)"
          : tier === "B"
            ? "🥈 B-Tier (중위권)"
            : "🥉 C-Tier (재건 필요)";
    ln(`### ${tierLabel}`);
    for (const t of tierTeams) {
      ln(
        `- **${t.name}** — Score: ${t.powerScore.toFixed(1)}, Cat합산: ${t.catRankSum}`,
      );
    }
    ln("");
  }

  ln("---");
  ln(
    `_Generated by fantasy_baseball CLI | Power Rankings Week ${week} | 2026 Season_`,
  );

  // 6) 저장
  const outPath = path.join(
    process.cwd(),
    "data",
    `power-rankings-week${week}-2026.md`,
  );
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`✅ 파워 랭킹 저장: ${outPath}`);
  console.log(lines.join("\n"));
}

function getLatestWeek(): number {
  const histPath = path.join(process.cwd(), "data", "history.json");
  if (!fs.existsSync(histPath)) return 1;
  try {
    const data = JSON.parse(fs.readFileSync(histPath, "utf-8"));
    const weeks: number[] = (data.weeks || []).map((w: any) => w.week);
    return weeks.length > 0 ? Math.max(...weeks) : 1;
  } catch {
    return 1;
  }
}

// CLI
const week = parseInt(process.argv[2] || String(getLatestWeek()));
generatePowerRankings(week).catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
