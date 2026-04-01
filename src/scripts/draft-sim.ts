import "dotenv/config";
import { yahooApi } from "../api/yahoo.js";
import { printTable, printSection } from "../reports/format.js";

const LEAGUE_KEY = "469.l.18247";
const MY_PICK = 4;
const NUM_TEAMS = 12;
const TOTAL_ROSTER = 19; // C,1B,2B,3B,SS,OF×3,Util,SP×4,RP×4,P,BN×2

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

/** 스네이크 드래프트에서 내 픽 번호 계산 */
function getMyPicks(
  pickOrder: number,
  numTeams: number,
  rounds: number,
): number[] {
  const picks: number[] = [];
  for (let round = 0; round < rounds; round++) {
    if (round % 2 === 0) {
      // 홀수 라운드 (정방향)
      picks.push(round * numTeams + pickOrder);
    } else {
      // 짝수 라운드 (역방향)
      picks.push(round * numTeams + (numTeams - pickOrder + 1));
    }
  }
  return picks;
}

async function main() {
  // 250명 로드 (넉넉하게)
  const batches = await Promise.all(
    [0, 50, 100, 150, 200].map((start) =>
      yahooApi(`/league/${LEAGUE_KEY}/players;sort=OR;start=${start};count=50`),
    ),
  );

  const allPlayers: PlayerInfo[] = [];
  batches.forEach((batch, idx) => {
    allPlayers.push(...extractPlayers(batch, idx * 50));
  });

  const myPicks = getMyPicks(MY_PICK, NUM_TEAMS, TOTAL_ROSTER);

  // ── 내 픽 타이밍 ──
  printSection(`🎯 4픽 스네이크 드래프트 시뮬레이션 (12팀)`);

  console.log("내 픽 순서:");
  myPicks.forEach((pick, round) => {
    const dir = round % 2 === 0 ? "→" : "←";
    console.log(`  ${round + 1}R  ${dir}  전체 ${pick}번째 픽`);
  });

  // ── 라운드별 예상 가용 선수 ──
  printSection("📋 라운드별 예상 가용 선수");

  console.log(
    "※ 앞 픽들이 상위 랭킹 순으로 뽑는다고 가정한 최선/최악 시나리오\n",
  );

  for (let round = 0; round < Math.min(myPicks.length, 15); round++) {
    const pickNum = myPicks[round];
    const alreadyGone = pickNum - 1; // 내 앞에 뽑힌 수

    // 내 픽 시점에 남아있을 수 있는 선수 범위
    const availableStart = alreadyGone;
    const availableEnd = Math.min(
      availableStart + NUM_TEAMS,
      allPlayers.length,
    );
    const available = allPlayers.slice(availableStart, availableEnd);

    const roundLabel = `${round + 1}R (전체 ${pickNum}번째)`;
    console.log(`── ${roundLabel} ${"─".repeat(35)}`);

    if (available.length === 0) {
      console.log("  데이터 범위 초과\n");
      continue;
    }

    // 최선 (아직 남아있을 베스트)
    const best = available[0];
    // 최악 (이 범위의 마지막)
    const worst = available[available.length - 1];

    console.log(
      `  베스트: ${best.name} (${best.team}, ${best.position}) [${best.rank}위]`,
    );
    console.log(
      `  워스트: ${worst.name} (${worst.team}, ${worst.position}) [${worst.rank}위]`,
    );

    // 이 범위에서 포지션별 그룹
    const byPos: Record<string, string[]> = {};
    for (const p of available) {
      const pos = p.position.split(",")[0].trim();
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push(p.name);
    }
    const posStr = Object.entries(byPos)
      .map(([pos, names]) => `${pos}(${names.length})`)
      .join(" ");
    console.log(`  가용: ${posStr}\n`);
  }

  // ── 포지션별 드래프트 전략 ──
  printSection("🧩 포지션별 추천 타이밍");

  // 로스터 필요: C×1, 1B×1, 2B×1, 3B×1, SS×1, OF×3, Util×1, SP×4, RP×4, P×1, BN×2
  const posNeeds = [
    { pos: "C", need: 1, note: "Top150에 5명뿐" },
    { pos: "1B", need: 1, note: "6명" },
    { pos: "2B", need: 1, note: "6명" },
    { pos: "3B", need: 1, note: "4명 - 가장 희소!" },
    { pos: "SS", need: 1, note: "9명 - 상위에 몰려있음" },
    { pos: "OF", need: 3, note: "18명 - 가장 풍부" },
    { pos: "SP", need: 4, note: "19명 - 중반부터 확보" },
    { pos: "RP", need: 4, note: "7명 - 후반에 잡아도 됨" },
  ];

  // 각 포지션별 랭킹 분포에서 내 픽과 겹치는 선수 찾기
  for (const { pos, need, note } of posNeeds) {
    const posPlayers = allPlayers.filter(
      (p) => p.position.split(",")[0].trim() === pos,
    );

    console.log(`\n${pos} (필요: ${need}명) - ${note}`);

    // 내 각 픽 시점에 남아있을 수 있는 해당 포지션 선수
    for (const player of posPlayers.slice(
      0,
      Math.min(need + 3, posPlayers.length),
    )) {
      // 이 선수가 내 몇 라운드 픽과 가까운지
      const closestRound = myPicks.findIndex(
        (pick) => pick >= player.rank - 3 && pick <= player.rank + 3,
      );

      const roundStr =
        closestRound >= 0 ? `→ ${closestRound + 1}R에서 노려볼만` : "";
      console.log(
        `  ${player.rank}위 ${player.name} (${player.team}) ${roundStr}`,
      );
    }
  }

  // ── 추천 드래프트 플랜 ──
  printSection("💡 추천 드래프트 플랜 (4픽 기준)");

  const plan = [
    {
      round: "1R (4번째)",
      strategy: "엘리트 타자 확보",
      candidates: "Juan Soto / Bobby Witt Jr. / Elly De La Cruz",
    },
    {
      round: "2R (21번째)",
      strategy: "2번째 엘리트 or 희소 포지션",
      candidates: "Cal Raleigh(C) / Nick Kurtz(1B) / Jazz Chisholm(2B)",
    },
    {
      round: "3R (28번째)",
      strategy: "3B 또는 남은 상위 타자",
      candidates: "이 시점 3B 남아있으면 무조건 확보",
    },
    {
      round: "4R (45번째)",
      strategy: "SP 1번째 확보",
      candidates: "George Kirby / Freddy Peralta / Joe Ryan",
    },
    {
      round: "5R (52번째)",
      strategy: "OF or SP 추가",
      candidates: "Yordan Alvarez(OF) / Mason Miller(RP)",
    },
    {
      round: "6~7R",
      strategy: "SP/RP 보강",
      candidates: "Hunter Greene / Dylan Cease / 구원 에이스",
    },
    {
      round: "8~10R",
      strategy: "남은 포지션 채우기",
      candidates: "BN 후보 + 가치 픽",
    },
  ];

  printTable(
    ["라운드", "전략", "후보"],
    plan.map((p) => [p.round, p.strategy, p.candidates]),
  );

  console.log("\n⚠️  핵심 원칙:");
  console.log("  1. 3B는 4명뿐 → 3R까지 못 잡으면 큰 손해");
  console.log("  2. C는 Cal Raleigh 이후 큰 갭 → 2R에서 고려");
  console.log("  3. OF는 후반에도 좋은 선수 많음 → 서두르지 말 것");
  console.log("  4. SP는 4~6R에 집중 확보, RP는 그 이후");
}

main().catch(console.error);
