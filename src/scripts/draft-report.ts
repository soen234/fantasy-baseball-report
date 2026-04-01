import "dotenv/config";
import { yahooApi } from "../api/yahoo.js";
import { printTable, printSection } from "../reports/format.js";

const LEAGUE_KEY = "469.l.18247";

interface PlayerInfo {
  rank: number;
  name: string;
  team: string;
  position: string;
  positionType: string;
}

function extractPlayers(data: any, startRank: number): PlayerInfo[] {
  const players: PlayerInfo[] = [];
  const playersObj = data.fantasy_content.league[1].players;

  for (let i = 0; i < playersObj.count; i++) {
    const arr = playersObj[i].player[0];
    players.push({
      rank: startRank + i + 1,
      name: arr.find((p: any) => p.name)?.name?.full ?? "?",
      team:
        arr.find((p: any) => p.editorial_team_abbr)?.editorial_team_abbr ?? "?",
      position:
        arr.find((p: any) => p.display_position)?.display_position ?? "?",
      positionType: arr.find((p: any) => p.position_type)?.position_type ?? "?",
    });
  }
  return players;
}

async function main() {
  // 150명 병렬 로드
  const [p0, p50, p100] = await Promise.all([
    yahooApi(`/league/${LEAGUE_KEY}/players;sort=OR;count=50`),
    yahooApi(`/league/${LEAGUE_KEY}/players;sort=OR;start=50;count=50`),
    yahooApi(`/league/${LEAGUE_KEY}/players;sort=OR;start=100;count=50`),
  ]);

  const allPlayers = [
    ...extractPlayers(p0, 0),
    ...extractPlayers(p50, 50),
    ...extractPlayers(p100, 100),
  ];

  const batters = allPlayers.filter((p) => p.positionType === "B");
  const pitchers = allPlayers.filter((p) => p.positionType === "P");

  // ── 드래프트 준비 리포트 ──
  printSection("📋 드래프트 준비 리포트");

  // 12팀 스네이크 드래프트 라운드별 예상
  console.log("12팀 스네이크 드래프트 기준:");
  console.log("  1라운드: 1~12위  |  2라운드: 13~24위  |  3라운드: 25~36위");
  console.log("  4라운드: 37~48위 |  5라운드: 49~60위  |  ...\n");

  // 전체 Top 25
  printSection("🏆 전체 Top 25 (1~2라운드 픽)");
  printTable(
    ["순위", "이름", "팀", "포지션", "타입"],
    allPlayers
      .slice(0, 25)
      .map((p) => [
        String(p.rank),
        p.name,
        p.team,
        p.position,
        p.positionType === "B" ? "타자" : "투수",
      ]),
  );

  // 포지션별 정리
  const positionGroups: Record<string, PlayerInfo[]> = {};
  for (const p of allPlayers) {
    const mainPos = p.position.split(",")[0].trim();
    if (!positionGroups[mainPos]) positionGroups[mainPos] = [];
    positionGroups[mainPos].push(p);
  }

  // 타자 포지션별
  const batterPositions = ["C", "1B", "2B", "3B", "SS", "OF", "Util"];
  for (const pos of batterPositions) {
    const group = positionGroups[pos];
    if (!group || group.length === 0) continue;
    printSection(`포지션: ${pos} (${group.length}명)`);
    printTable(
      ["순위", "이름", "팀"],
      group.map((p) => [String(p.rank), p.name, p.team]),
    );
  }

  // 투수
  printSection(`🔥 선발투수 SP (${(positionGroups["SP"] || []).length}명)`);
  if (positionGroups["SP"]) {
    printTable(
      ["순위", "이름", "팀"],
      positionGroups["SP"].map((p) => [String(p.rank), p.name, p.team]),
    );
  }

  printSection(`💪 구원투수 RP (${(positionGroups["RP"] || []).length}명)`);
  if (positionGroups["RP"]) {
    printTable(
      ["순위", "이름", "팀"],
      positionGroups["RP"].map((p) => [String(p.rank), p.name, p.team]),
    );
  }

  // 포지션 희소성 분석
  printSection("📊 포지션 희소성 (Top 150 중)");
  const scarcity: [string, number][] = [];
  for (const pos of [...batterPositions, "SP", "RP"]) {
    const count = (positionGroups[pos] || []).length;
    scarcity.push([pos, count]);
  }
  scarcity.sort((a, b) => a[1] - b[1]);

  printTable(
    ["포지션", "Top150 내 인원", "희소성"],
    scarcity.map(([pos, count]) => [
      pos,
      String(count),
      count <= 5 ? "🔴 매우 희소" : count <= 10 ? "🟡 보통" : "🟢 풍부",
    ]),
  );

  // 타자/투수 비율
  printSection("📈 타자 vs 투수 비율 (Top 150)");
  console.log(
    `  타자: ${batters.length}명 (${Math.round((batters.length / 150) * 100)}%)`,
  );
  console.log(
    `  투수: ${pitchers.length}명 (${Math.round((pitchers.length / 150) * 100)}%)`,
  );
  console.log(`\n  → 로스터 구성: 타자 9슬롯 / 투수 9슬롯 (1:1)`);
  console.log(
    `  → 랭킹 비율:  타자 ${Math.round((batters.length / 150) * 100)}% / 투수 ${Math.round((pitchers.length / 150) * 100)}%`,
  );

  if (batters.length > pitchers.length * 1.5) {
    console.log(
      `\n  💡 투수가 상대적으로 희소합니다. 중반 라운드에서 SP를 선점하는 것이 유리할 수 있습니다.`,
    );
  }
}

main().catch(console.error);
