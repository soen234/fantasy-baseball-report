import "dotenv/config";
import { yahooApi } from "../api/yahoo.js";
import { printTable, printSection } from "../reports/format.js";

interface PlayerInfo {
  rank: number;
  name: string;
  team: string;
  position: string;
  positionType: string;
  eligiblePositions: string[];
}

function extractPlayers(data: any): PlayerInfo[] {
  const players: PlayerInfo[] = [];
  const playersObj = data.fantasy_content.league[1].players;

  for (let i = 0; i < playersObj.count; i++) {
    const playerArr = playersObj[i].player[0];

    // Yahoo API는 배열 안에 각 필드를 개별 객체로 반환
    const name = playerArr.find((p: any) => p.name)?.name?.full ?? "Unknown";
    const team =
      playerArr.find((p: any) => p.editorial_team_abbr)?.editorial_team_abbr ??
      "?";
    const position =
      playerArr.find((p: any) => p.display_position)?.display_position ?? "?";
    const positionType =
      playerArr.find((p: any) => p.position_type)?.position_type ?? "?";
    const eligiblePositions = (
      playerArr.find((p: any) => p.eligible_positions)?.eligible_positions ?? []
    )
      .filter((ep: any) => ep.position)
      .map((ep: any) => ep.position);

    players.push({
      rank: i + 1,
      name,
      team,
      position,
      positionType,
      eligiblePositions,
    });
  }

  return players;
}

function extractCategories(settingsData: any) {
  const settings = settingsData.fantasy_content.league[1].settings[0];
  const stats = settings.stat_categories.stats;

  const batting: string[] = [];
  const pitching: string[] = [];

  for (const s of stats) {
    const stat = s.stat;
    if (stat.is_only_display_stat === "1") continue;

    const label = `${stat.display_name} (${stat.name})`;
    const direction =
      stat.sort_order === "1" ? "↑높을수록 좋음" : "↓낮을수록 좋음";

    if (stat.group === "batting") {
      batting.push(`  ${label}  ${direction}`);
    } else {
      pitching.push(`  ${label}  ${direction}`);
    }
  }

  return { batting, pitching };
}

function extractRosterPositions(settingsData: any) {
  const settings = settingsData.fantasy_content.league[1].settings[0];
  return settings.roster_positions.map((rp: any) => {
    const pos = rp.roster_position;
    return {
      position: pos.position,
      count: pos.count,
      starting: pos.is_starting_position === 1,
    };
  });
}

async function main() {
  printSection("리그 평가 기준 (스코어링 카테고리)");

  const settingsData = await yahooApi("/league/469.l.18247/settings");
  const { batting, pitching } = extractCategories(settingsData);

  console.log("⚾ 타자 카테고리:");
  batting.forEach((b) => console.log(b));
  console.log("");
  console.log("⚾ 투수 카테고리:");
  pitching.forEach((p) => console.log(p));

  // 로스터 구성
  printSection("로스터 구성");
  const roster = extractRosterPositions(settingsData);
  printTable(
    ["포지션", "슬롯 수", "선발/벤치"],
    roster.map((r: any) => [
      r.position,
      String(r.count),
      r.starting ? "선발" : "벤치",
    ]),
  );

  // 드래프트 정보
  const draftTime = new Date(
    Number(settingsData.fantasy_content.league[1].settings[0].draft_time) *
      1000,
  );
  const pickTime =
    settingsData.fantasy_content.league[1].settings[0].draft_pick_time;

  printSection("드래프트 정보");
  console.log(`  드래프트 시간: ${draftTime.toLocaleString()}`);
  console.log(`  픽 제한 시간: ${pickTime}초`);
  console.log(
    `  드래프트 방식: ${settingsData.fantasy_content.league[1].settings[0].is_auction_draft === "1" ? "옥션" : "스네이크"}`,
  );

  // 선수 목록 (Top 50)
  printSection("드래프트 선수 랭킹 (Top 50)");

  const playersData = await yahooApi(
    "/league/469.l.18247/players;sort=OR;count=50",
  );
  const players = extractPlayers(playersData);

  const batters = players.filter((p) => p.positionType === "B");
  const pitchers = players.filter((p) => p.positionType === "P");

  console.log(`\n🏏 타자 (${batters.length}명):`);
  printTable(
    ["순위", "이름", "팀", "포지션", "가능 포지션"],
    batters.map((p) => [
      String(p.rank),
      p.name,
      p.team,
      p.position,
      p.eligiblePositions.join(", "),
    ]),
  );

  console.log(`\n⚾ 투수 (${pitchers.length}명):`);
  printTable(
    ["순위", "이름", "팀", "포지션", "가능 포지션"],
    pitchers.map((p) => [
      String(p.rank),
      p.name,
      p.team,
      p.position,
      p.eligiblePositions.join(", "),
    ]),
  );
}

main().catch(console.error);
