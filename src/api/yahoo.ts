import { loadToken, isTokenExpired } from "../auth/token.js";
import { refreshAccessToken } from "../auth/oauth.js";
import type { YahooToken } from "../types/yahoo.js";

const BASE_URL = "https://fantasysports.yahooapis.com/fantasy/v2";

// 동시 호출 시 갱신을 한 번만 수행하기 위한 캐시
let refreshPromise: Promise<YahooToken> | null = null;

/** 유효한 액세스 토큰 반환 (만료 시 자동 갱신, 중복 방지) */
async function getValidToken(): Promise<YahooToken> {
  const token = loadToken();
  if (!token) {
    throw new Error("인증이 필요합니다. `fb auth` 를 먼저 실행하세요.");
  }

  if (isTokenExpired(token)) {
    if (!refreshPromise) {
      console.log("🔄 토큰 갱신 중...");
      refreshPromise = refreshAccessToken(token.refresh_token).finally(() => {
        refreshPromise = null;
      });
    }
    return await refreshPromise;
  }

  return token;
}

/** Yahoo Fantasy API 호출 (JSON 응답) */
export async function yahooApi(path: string): Promise<any> {
  const token = await getValidToken();

  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}format=json`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Yahoo API 에러 (${res.status}): ${err}`);
  }

  return res.json();
}

/** 내 리그 목록 가져오기 */
export async function getMyLeagues(season?: string) {
  const gameKey = season ? `mlb.s.${season}` : "mlb";
  const data = await yahooApi(
    `/users;use_login=1/games;game_keys=${gameKey}/leagues`,
  );
  return data;
}

/** 리그 순위 */
export async function getStandings(leagueKey: string) {
  return yahooApi(`/league/${leagueKey}/standings`);
}

/** 리그 스코어보드 */
export async function getScoreboard(leagueKey: string, week?: number) {
  const weekParam = week ? `;week=${week}` : "";
  return yahooApi(`/league/${leagueKey}/scoreboard${weekParam}`);
}

/** 드래프트 결과 */
export async function getDraftResults(leagueKey: string) {
  return yahooApi(`/league/${leagueKey}/draftresults`);
}

/** 팀 로스터 */
export async function getRoster(teamKey: string) {
  return yahooApi(`/team/${teamKey}/roster/players`);
}

/** 리그 설정 */
export async function getLeagueSettings(leagueKey: string) {
  return yahooApi(`/league/${leagueKey}/settings`);
}

/** 선수 검색 */
export async function searchPlayers(leagueKey: string, search: string) {
  return yahooApi(
    `/league/${leagueKey}/players;search=${encodeURIComponent(search)}`,
  );
}

/** 리그 트랜잭션 */
export async function getTransactions(leagueKey: string) {
  return yahooApi(`/league/${leagueKey}/transactions`);
}

/** 팀 스탯 */
export async function getTeamStats(teamKey: string) {
  return yahooApi(`/team/${teamKey}/stats`);
}

/** Hot Players (lastweek AR 기준) */
export async function getHotPlayers(
  leagueKey: string,
  position: "B" | "P",
  count = 3,
) {
  const pos = position === "B" ? "B" : "P";
  return yahooApi(
    `/league/${leagueKey}/players;status=T;position=${pos};sort=AR;sort_type=lastweek;count=${count}/stats;type=lastweek`,
  );
}

/** FA (Free Agent) 목록 */
export async function getFreeAgents(leagueKey: string, position?: string) {
  const posParam = position ? `;position=${position}` : "";
  return yahooApi(`/league/${leagueKey}/players;status=FA${posParam}`);
}
