import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { yahooApi } from "../api/yahoo.js";
import { printSection, printTable } from "../reports/format.js";

const MLB_RSS_URL = "https://www.mlb.com/feeds/news/rss.xml";
const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_NEWS_LOOKBACK_DAYS = 14;
const TEAM_RSS_SLUGS: Record<string, string> = {
  ARI: "dbacks",
  ATL: "braves",
  BAL: "orioles",
  BOS: "redsox",
  CHC: "cubs",
  CHW: "whitesox",
  CIN: "reds",
  CLE: "guardians",
  COL: "rockies",
  DET: "tigers",
  HOU: "astros",
  KC: "royals",
  LAA: "angels",
  LAD: "dodgers",
  MIA: "marlins",
  MIL: "brewers",
  MIN: "twins",
  NYM: "mets",
  NYY: "yankees",
  ATH: "athletics",
  OAK: "athletics",
  PHI: "phillies",
  PIT: "pirates",
  SD: "padres",
  SF: "giants",
  SEA: "mariners",
  STL: "cardinals",
  TB: "rays",
  TEX: "rangers",
  TOR: "bluejays",
  WSH: "nationals",
  AZ: "dbacks",
};

const NEGATIVE_HEALTH_PATTERNS = [
  /injured list/i,
  /out until/i,
  /surgery/i,
  /bone chips/i,
  /status up in the air/i,
  /not ready/i,
  /shut down/i,
  /setback/i,
  /elbow/i,
  /shoulder/i,
  /forearm/i,
  /oblique/i,
  /hamstring/i,
  /quad/i,
  /back/i,
  /wrist/i,
  /knee/i,
];

const POSITIVE_HEALTH_PATTERNS = [
  /ready for opening day/i,
  /optimistic/i,
  /rejoining/i,
  /activated/i,
  /back in/i,
  /returns?/i,
];

const WBC_PATTERNS = [
  /world baseball classic/i,
  /\bclassic\b/i,
  /team usa/i,
  /team japan/i,
  /team korea/i,
  /team mexico/i,
  /team puerto rico/i,
  /team dominican republic/i,
];

const POSITIVE_ROLE_PATTERNS = [
  /leading off/i,
  /batting leadoff/i,
  /cleanup spot/i,
  /batting cleanup/i,
  /everyday role/i,
  /everyday player/i,
  /locked in/i,
  /won .*job/i,
  /wins? .*job/i,
  /rotation spot/i,
  /opening day starter/i,
  /named closer/i,
  /closing duties/i,
];

const NEGATIVE_ROLE_PATTERNS = [
  /platoon/i,
  /timeshare/i,
  /bench role/i,
  /optioned/i,
  /triple-a/i,
  /minor league/i,
  /competition/i,
  /workload/i,
  /innings limit/i,
  /pitch count/i,
  /managed carefully/i,
  /eased in/i,
];

const PRIMARY_FASTBALL_CODES = ["FF", "SI", "FC", "FA"] as const;
const TRACKED_HITTER_POSITIONS = ["C", "1B", "2B", "3B", "SS", "OF"] as const;
const TRACKED_PITCHER_POSITIONS = ["SP", "RP"] as const;

export interface YahooBoardPlayer {
  rank: number;
  name: string;
  cleanName: string;
  team: string;
  displayPosition: string;
  positionType: string;
}

interface RssItem {
  title: string;
  link: string;
  publishedAt: string;
  epoch: number;
}

interface MlbPerson {
  id: number;
  fullName: string;
  active: boolean;
}

interface TransactionRecord {
  date: string;
  description: string;
  typeCode: string;
}

interface SpringSnapshot {
  games: number;
  lastDate: string | null;
  hitter?: {
    plateAppearances: number;
    atBats: number;
    hits: number;
    homeRuns: number;
    walks: number;
    strikeOuts: number;
    hitByPitch: number;
    sacFlies: number;
    totalBases: number;
    onBasePercentage: number;
    sluggingPercentage: number;
  };
  pitcher?: {
    outs: number;
    battersFaced: number;
    hitsAllowed: number;
    walks: number;
    strikeOuts: number;
    earnedRuns: number;
    saves: number;
    holds: number;
    era: number;
    whip: number;
  };
}

interface SpringQualitySnapshot {
  hitter?: {
    battedBallEvents: number;
    averageLaunchSpeed: number | null;
    averageLaunchAngle: number | null;
    averageDistance: number | null;
  };
  pitcher?: {
    pitchCode: string | null;
    pitchName: string | null;
    sampleSize: number;
    releaseSpeed: number | null;
    effectiveSpeed: number | null;
    releaseSpinRate: number | null;
  };
}

interface SeasonBaseline {
  hitter?: {
    gamesPlayed: number;
    plateAppearances: number;
    runs: number;
    hits: number;
    homeRuns: number;
    rbi: number;
    walks: number;
    strikeOuts: number;
    totalBases: number;
    avg: number;
    obp: number;
    slg: number;
    stolenBases: number;
    caughtStealing: number;
  };
  pitcher?: {
    gamesPitched: number;
    gamesStarted: number;
    wins: number;
    losses: number;
    strikeOuts: number;
    walks: number;
    groundIntoDoublePlay: number;
    totalBasesAllowed: number;
    era: number;
    whip: number;
    strikeoutWalkRatio: number;
    saves: number;
    holds: number;
    blownSaves: number;
    outs: number;
  };
  fielding?: {
    games: number;
    assists: number;
    primaryPosition: string | null;
  };
}

interface LeagueCategory {
  abbr: string;
  name: string;
  sortOrder: "high" | "low";
  positionType: "B" | "P";
}

interface LeagueContext {
  leagueKey: string;
  numTeams: number;
  minInningsPitched: number;
  rosterSlots: Record<string, number>;
  battingCategories: LeagueCategory[];
  pitchingCategories: LeagueCategory[];
  hitterFocus: {
    discipline: number;
    power: number;
    average: number;
    speed: number;
    defense: number;
  };
  pitcherFocus: {
    starter: number;
    reliever: number;
    ratio: number;
    groundball: number;
  };
  strategyNotes: string[];
}

interface PlayerEvaluation {
  player: YahooBoardPlayer;
  mlbPerson: MlbPerson | null;
  spring: SpringSnapshot | null;
  quality: SpringQualitySnapshot | null;
  season: SeasonBaseline | null;
  transactions: TransactionRecord[];
  news: RssItem[];
  healthRiskScore: number;
  healthLevel: "low" | "medium" | "high";
  expectationDelta: number;
  recommendation: "target" | "hold" | "caution" | "fade";
  notes: string[];
  fitNotes: string[];
  positionScarcityScore: number;
  categoryFitScore: number;
  roleFitScore: number;
  leagueFitScore: number;
  priorityScore: number;
}

interface ExpectationOptions {
  leagueKey: string;
  count?: number;
  myPick?: number;
  numTeams?: number;
  rounds?: number;
  markdownPath?: string;
}

interface RoundPlan {
  round: number;
  pick: number;
  candidates: PlayerEvaluation[];
  board: PlayerEvaluation[];
}

const personSearchCache = new Map<string, Promise<MlbPerson | null>>();
const seasonBaselineCache = new Map<string, Promise<SeasonBaseline | null>>();

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeName(value: string): string {
  return value
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function truncate(value: string, maxLength = 68): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatDecimal(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function parseIpFromOuts(outs: number): string {
  const whole = Math.floor(outs / 3);
  const remainder = outs % 3;
  return `${whole}.${remainder}`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return Number(value);
  }
  return 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const itemXml = match[1];
    const titleMatch =
      itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ??
      itemXml.match(/<title>(.*?)<\/title>/);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

    if (!titleMatch || !linkMatch || !pubDateMatch) {
      continue;
    }

    items.push({
      title: decodeXml(titleMatch[1].trim()),
      link: decodeXml(linkMatch[1].trim()),
      publishedAt: pubDateMatch[1].trim(),
      epoch: Date.parse(pubDateMatch[1].trim()),
    });
  }

  return items;
}

function dedupeRssItems(items: RssItem[]): RssItem[] {
  const seen = new Set<string>();
  const deduped: RssItem[] = [];
  for (const item of items) {
    if (seen.has(item.link)) {
      continue;
    }
    seen.add(item.link);
    deduped.push(item);
  }
  return deduped.sort((a, b) => b.epoch - a.epoch);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`요청 실패 (${response.status}): ${url}`);
  }
  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`요청 실패 (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

function getMyPicks(
  pickOrder: number,
  numTeams: number,
  rounds: number,
): number[] {
  const picks: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    if (round % 2 === 0) {
      picks.push(round * numTeams + pickOrder);
    } else {
      picks.push(round * numTeams + (numTeams - pickOrder + 1));
    }
  }
  return picks;
}

function extractYahooPlayers(data: any, startRank: number): YahooBoardPlayer[] {
  const players: YahooBoardPlayer[] = [];
  const playersObj = data.fantasy_content.league[1].players;

  for (let i = 0; i < playersObj.count; i += 1) {
    const playerArr = playersObj[i].player[0];
    const name =
      playerArr.find((entry: any) => entry.name)?.name?.full?.trim() ??
      "Unknown";
    const team =
      playerArr.find((entry: any) => entry.editorial_team_abbr)
        ?.editorial_team_abbr ?? "?";
    const displayPosition =
      playerArr.find((entry: any) => entry.display_position)
        ?.display_position ?? "?";
    const positionType =
      playerArr.find((entry: any) => entry.position_type)?.position_type ?? "?";

    players.push({
      rank: startRank + i + 1,
      name,
      cleanName: name.replace(/\s*\([^)]*\)\s*/g, "").trim(),
      team,
      displayPosition,
      positionType,
    });
  }

  return players;
}

async function fetchYahooBoard(
  leagueKey: string,
  count: number,
): Promise<YahooBoardPlayer[]> {
  const batchSize = 50;
  const starts = Array.from(
    { length: Math.ceil(count / batchSize) },
    (_, index) => index * batchSize,
  );

  const batches = await Promise.all(
    starts.map((start) =>
      yahooApi(
        `/league/${leagueKey}/players;sort=OR;start=${start};count=${batchSize}`,
      ),
    ),
  );

  return batches
    .flatMap((batch, index) => extractYahooPlayers(batch, index * batchSize))
    .slice(0, count);
}

async function fetchMlbNewsFeed(): Promise<RssItem[]> {
  const xml = await fetchText(MLB_RSS_URL);
  return parseRssItems(xml);
}

async function fetchTeamNewsFeeds(teams: string[]): Promise<RssItem[]> {
  const urls = [
    ...new Set(
      teams
        .map((team) => TEAM_RSS_SLUGS[team])
        .filter((slug): slug is string => Boolean(slug))
        .map((slug) => `https://www.mlb.com/${slug}/feeds/news/rss.xml`),
    ),
  ];

  const feeds = await mapWithConcurrency(urls, 4, async (url) => {
    try {
      const xml = await fetchText(url);
      return parseRssItems(xml);
    } catch {
      return [];
    }
  });

  return dedupeRssItems(feeds.flat());
}

async function searchMlbPerson(name: string): Promise<MlbPerson | null> {
  const normalized = normalizeName(name);
  const cached = personSearchCache.get(normalized);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const url = `${MLB_STATS_API}/people/search?${new URLSearchParams({
      names: name,
    }).toString()}`;
    const payload = await fetchJson<{
      people?: Array<{ id: number; fullName: string; active: boolean }>;
    }>(url);
    const people = payload.people ?? [];
    if (people.length === 0) {
      return null;
    }

    const exact = people.find(
      (person) =>
        normalizeName(person.fullName) === normalized && person.active,
    );
    if (exact) {
      return exact;
    }

    const active = people.find((person) => person.active);
    return active ?? people[0] ?? null;
  })();

  personSearchCache.set(normalized, promise);
  return promise;
}

async function fetchTransactions(
  playerId: number,
): Promise<TransactionRecord[]> {
  const url = `${MLB_STATS_API}/transactions?${new URLSearchParams({
    playerId: String(playerId),
    sportId: "1",
    startDate: "2025-01-01",
    endDate: new Date().toISOString().slice(0, 10),
  }).toString()}`;

  const payload = await fetchJson<{
    transactions?: Array<{
      date: string;
      description: string;
      typeCode: string;
    }>;
  }>(url);

  return (payload.transactions ?? []).map((transaction) => ({
    date: transaction.date,
    description: transaction.description,
    typeCode: transaction.typeCode,
  }));
}

async function fetchSpringSnapshot(
  playerId: number,
  positionType: string,
): Promise<SpringSnapshot | null> {
  const group = positionType === "P" ? "pitching" : "hitting";
  const url = `${MLB_STATS_API}/people/${playerId}/stats?${new URLSearchParams({
    stats: "gameLog",
    group,
    gameType: "S",
    season: "2026",
  }).toString()}`;

  const payload = await fetchJson<{
    stats?: Array<{
      splits?: Array<{ date: string; stat: Record<string, unknown> }>;
    }>;
  }>(url);
  const splits = payload.stats?.[0]?.splits ?? [];

  if (splits.length === 0) {
    return null;
  }

  let lastDate = splits[0]?.date ?? null;

  if (positionType === "P") {
    let outs = 0;
    let battersFaced = 0;
    let hitsAllowed = 0;
    let walks = 0;
    let strikeOuts = 0;
    let earnedRuns = 0;
    let saves = 0;
    let holds = 0;

    for (const split of splits) {
      const stat = split.stat;
      lastDate = lastDate && lastDate > split.date ? lastDate : split.date;
      outs += toNumber(stat.outs);
      battersFaced += toNumber(stat.battersFaced);
      hitsAllowed += toNumber(stat.hits);
      walks += toNumber(stat.baseOnBalls);
      strikeOuts += toNumber(stat.strikeOuts);
      earnedRuns += toNumber(stat.earnedRuns);
      saves += toNumber(stat.saves);
      holds += toNumber(stat.holds);
    }

    const innings = outs / 3;
    return {
      games: splits.length,
      lastDate,
      pitcher: {
        outs,
        battersFaced,
        hitsAllowed,
        walks,
        strikeOuts,
        earnedRuns,
        saves,
        holds,
        era: innings > 0 ? (earnedRuns * 9) / innings : 0,
        whip: innings > 0 ? (hitsAllowed + walks) / innings : 0,
      },
    };
  }

  let plateAppearances = 0;
  let atBats = 0;
  let hits = 0;
  let homeRuns = 0;
  let walks = 0;
  let strikeOuts = 0;
  let hitByPitch = 0;
  let sacFlies = 0;
  let totalBases = 0;

  for (const split of splits) {
    const stat = split.stat;
    lastDate = lastDate && lastDate > split.date ? lastDate : split.date;
    plateAppearances += toNumber(stat.plateAppearances);
    atBats += toNumber(stat.atBats);
    hits += toNumber(stat.hits);
    homeRuns += toNumber(stat.homeRuns);
    walks += toNumber(stat.baseOnBalls);
    strikeOuts += toNumber(stat.strikeOuts);
    hitByPitch += toNumber(stat.hitByPitch);
    sacFlies += toNumber(stat.sacFlies);
    totalBases += toNumber(stat.totalBases);
  }

  const obpDenominator = atBats + walks + hitByPitch + sacFlies;
  return {
    games: splits.length,
    lastDate,
    hitter: {
      plateAppearances,
      atBats,
      hits,
      homeRuns,
      walks,
      strikeOuts,
      hitByPitch,
      sacFlies,
      totalBases,
      onBasePercentage:
        obpDenominator > 0 ? (hits + walks + hitByPitch) / obpDenominator : 0,
      sluggingPercentage: atBats > 0 ? totalBases / atBats : 0,
    },
  };
}

async function fetchSpringQuality(
  playerId: number,
  positionType: string,
): Promise<SpringQualitySnapshot | null> {
  const isPitcher = positionType === "P";
  const group = isPitcher ? "pitching" : "hitting";
  const metrics = isPitcher
    ? "releaseSpeed,releaseSpinRate,effectiveSpeed"
    : "launchSpeed,launchAngle,distance";
  const url = `${MLB_STATS_API}/people/${playerId}/stats?${new URLSearchParams({
    stats: "metricAverages",
    group,
    gameType: "S",
    season: "2026",
    metrics,
  }).toString()}`;

  const payload = await fetchJson<{
    stats?: Array<{
      splits?: Array<{
        numOccurrences?: number;
        stat?: {
          metric?: {
            name?: string;
            averageValue?: number;
          };
          event?: {
            details?: {
              type?: {
                code?: string;
                description?: string;
              };
            };
          };
        };
      }>;
    }>;
  }>(url);
  const splits = payload.stats?.[0]?.splits ?? [];

  if (splits.length === 0) {
    return null;
  }

  if (!isPitcher) {
    const metricsByName = new Map<
      string,
      { averageValue: number | null; numOccurrences: number }
    >();

    for (const split of splits) {
      const metricName = split.stat?.metric?.name;
      if (!metricName) {
        continue;
      }
      metricsByName.set(metricName, {
        averageValue:
          typeof split.stat?.metric?.averageValue === "number"
            ? split.stat.metric.averageValue
            : null,
        numOccurrences: toNumber(split.numOccurrences),
      });
    }

    const battedBallEvents = Math.max(
      0,
      ...Array.from(metricsByName.values()).map(
        (metric) => metric.numOccurrences,
      ),
    );

    if (metricsByName.size === 0) {
      return null;
    }

    return {
      hitter: {
        battedBallEvents,
        averageLaunchSpeed:
          metricsByName.get("launchSpeed")?.averageValue ?? null,
        averageLaunchAngle:
          metricsByName.get("launchAngle")?.averageValue ?? null,
        averageDistance: metricsByName.get("distance")?.averageValue ?? null,
      },
    };
  }

  const metricsByPitch = new Map<
    string,
    {
      pitchCode: string | null;
      pitchName: string | null;
      sampleSize: number;
      releaseSpeed: number | null;
      effectiveSpeed: number | null;
      releaseSpinRate: number | null;
    }
  >();

  for (const split of splits) {
    const pitchCode = split.stat?.event?.details?.type?.code ?? "ALL";
    const pitchName = split.stat?.event?.details?.type?.description ?? "All";
    const metricName = split.stat?.metric?.name;
    if (!metricName) {
      continue;
    }

    const existing = metricsByPitch.get(pitchCode) ?? {
      pitchCode,
      pitchName,
      sampleSize: 0,
      releaseSpeed: null,
      effectiveSpeed: null,
      releaseSpinRate: null,
    };

    existing.sampleSize = Math.max(
      existing.sampleSize,
      toNumber(split.numOccurrences),
    );
    const averageValue =
      typeof split.stat?.metric?.averageValue === "number"
        ? split.stat.metric.averageValue
        : null;

    if (metricName === "releaseSpeed") {
      existing.releaseSpeed = averageValue;
    } else if (metricName === "effectiveSpeed") {
      existing.effectiveSpeed = averageValue;
    } else if (metricName === "releaseSpinRate") {
      existing.releaseSpinRate = averageValue;
    }

    metricsByPitch.set(pitchCode, existing);
  }

  const pitches = Array.from(metricsByPitch.values()).filter(
    (entry) => entry.sampleSize > 0,
  );

  if (pitches.length === 0) {
    return null;
  }

  const fastballPool = pitches.filter((entry) =>
    PRIMARY_FASTBALL_CODES.includes(
      (entry.pitchCode ?? "") as (typeof PRIMARY_FASTBALL_CODES)[number],
    ),
  );
  const sortedPool = (fastballPool.length > 0 ? fastballPool : pitches).sort(
    (a, b) =>
      b.sampleSize - a.sampleSize ||
      toNumber(b.releaseSpeed) - toNumber(a.releaseSpeed),
  );
  const primaryPitch = sortedPool[0];

  return {
    pitcher: {
      pitchCode: primaryPitch.pitchCode,
      pitchName: primaryPitch.pitchName,
      sampleSize: primaryPitch.sampleSize,
      releaseSpeed: primaryPitch.releaseSpeed,
      effectiveSpeed: primaryPitch.effectiveSpeed,
      releaseSpinRate: primaryPitch.releaseSpinRate,
    },
  };
}

async function fetchSeasonBaseline(
  playerId: number,
  positionType: string,
): Promise<SeasonBaseline | null> {
  const cacheKey = `${playerId}:${positionType}`;
  const cached = seasonBaselineCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const season = "2025";

    if (positionType === "P") {
      const payload = await fetchJson<{
        stats?: Array<{
          splits?: Array<{ stat?: Record<string, unknown> }>;
        }>;
      }>(
        `${MLB_STATS_API}/people/${playerId}/stats?${new URLSearchParams({
          stats: "season",
          group: "pitching",
          gameType: "R",
          season,
        }).toString()}`,
      );
      const stat = payload.stats?.[0]?.splits?.[0]?.stat;
      if (!stat) {
        return null;
      }

      return {
        pitcher: {
          gamesPitched: toNumber(stat.gamesPitched ?? stat.gamesPlayed),
          gamesStarted: toNumber(stat.gamesStarted),
          wins: toNumber(stat.wins),
          losses: toNumber(stat.losses),
          strikeOuts: toNumber(stat.strikeOuts),
          walks: toNumber(stat.baseOnBalls),
          groundIntoDoublePlay: toNumber(stat.groundIntoDoublePlay),
          totalBasesAllowed: toNumber(stat.totalBases),
          era: toNumber(stat.era),
          whip: toNumber(stat.whip),
          strikeoutWalkRatio: toNumber(stat.strikeoutWalkRatio),
          saves: toNumber(stat.saves),
          holds: toNumber(stat.holds),
          blownSaves: toNumber(stat.blownSaves),
          outs: toNumber(stat.outs),
        },
      };
    }

    const [hittingPayload, fieldingPayload] = await Promise.all([
      fetchJson<{
        stats?: Array<{
          splits?: Array<{ stat?: Record<string, unknown> }>;
        }>;
      }>(
        `${MLB_STATS_API}/people/${playerId}/stats?${new URLSearchParams({
          stats: "season",
          group: "hitting",
          gameType: "R",
          season,
        }).toString()}`,
      ),
      fetchJson<{
        stats?: Array<{
          splits?: Array<{ stat?: Record<string, unknown> }>;
        }>;
      }>(
        `${MLB_STATS_API}/people/${playerId}/stats?${new URLSearchParams({
          stats: "season",
          group: "fielding",
          gameType: "R",
          season,
        }).toString()}`,
      ).catch(() => ({ stats: [] })),
    ]);

    const hitterStat = hittingPayload.stats?.[0]?.splits?.[0]?.stat;
    const fieldingSplits = fieldingPayload.stats?.[0]?.splits ?? [];

    if (!hitterStat && fieldingSplits.length === 0) {
      return null;
    }

    let primaryPosition: string | null = null;
    let primaryGames = -1;
    let totalFieldingGames = 0;
    let totalAssists = 0;

    for (const split of fieldingSplits) {
      const stat = split.stat ?? {};
      const games = toNumber(stat.games ?? stat.gamesPlayed);
      totalFieldingGames += games;
      totalAssists += toNumber(stat.assists);
      const position =
        typeof stat.position === "object" &&
        stat.position !== null &&
        "abbreviation" in stat.position
          ? String(
              (stat.position as { abbreviation?: string }).abbreviation ?? "",
            )
          : null;
      if (games > primaryGames && position) {
        primaryGames = games;
        primaryPosition = position;
      }
    }

    return {
      hitter: hitterStat
        ? {
            gamesPlayed: toNumber(hitterStat.gamesPlayed),
            plateAppearances: toNumber(hitterStat.plateAppearances),
            runs: toNumber(hitterStat.runs),
            hits: toNumber(hitterStat.hits),
            homeRuns: toNumber(hitterStat.homeRuns),
            rbi: toNumber(hitterStat.rbi),
            walks: toNumber(hitterStat.baseOnBalls),
            strikeOuts: toNumber(hitterStat.strikeOuts),
            totalBases: toNumber(hitterStat.totalBases),
            avg: toNumber(hitterStat.avg),
            obp: toNumber(hitterStat.obp),
            slg: toNumber(hitterStat.slg),
            stolenBases: toNumber(hitterStat.stolenBases),
            caughtStealing: toNumber(hitterStat.caughtStealing),
          }
        : undefined,
      fielding:
        totalFieldingGames > 0 || totalAssists > 0
          ? {
              games: totalFieldingGames,
              assists: totalAssists,
              primaryPosition,
            }
          : undefined,
    };
  })();

  seasonBaselineCache.set(cacheKey, promise);
  return promise;
}

async function fetchLeagueContext(
  leagueKey: string,
  fallbackTeams: number,
): Promise<LeagueContext> {
  const data = await yahooApi(`/league/${leagueKey}/settings`);
  const settingsBlocks = data.fantasy_content.league[1].settings;
  const baseInfo = data.fantasy_content.league[0] ?? {};
  const mainSettings = settingsBlocks?.[0] ?? {};
  const scoringSettings = settingsBlocks?.[1] ?? {};

  const rosterSlots: Record<string, number> = {};
  const rosterPositions = mainSettings.roster_positions ?? [];
  for (const entry of rosterPositions) {
    const rosterPosition = entry.roster_position ?? {};
    if (!toNumber(rosterPosition.is_starting_position)) {
      continue;
    }
    const position = String(rosterPosition.position ?? "").trim();
    if (!position) {
      continue;
    }
    rosterSlots[position] =
      (rosterSlots[position] ?? 0) + toNumber(rosterPosition.count);
  }

  const stats = mainSettings.stat_categories?.stats ?? [];
  const categories: LeagueCategory[] = stats
    .map((entry: any) => entry.stat)
    .filter((stat: any) => String(stat?.enabled ?? "1") === "1")
    .map((stat: any) => ({
      abbr: String(stat.abbr ?? ""),
      name: String(stat.display_name ?? stat.name ?? ""),
      sortOrder: String(stat.sort_order ?? "1") === "0" ? "low" : "high",
      positionType: String(stat.position_type ?? "B") as "B" | "P",
    }))
    .filter((stat: LeagueCategory) => stat.abbr.length > 0);

  const battingCategories = categories.filter(
    (category) => category.positionType === "B",
  );
  const pitchingCategories = categories.filter(
    (category) => category.positionType === "P",
  );
  const battingSet = new Set(
    battingCategories.map((category) => category.abbr),
  );
  const pitchingSet = new Set(
    pitchingCategories.map((category) => category.abbr),
  );

  const hitterFocus = {
    discipline:
      (battingSet.has("BB") ? 1.1 : 0) +
      (battingSet.has("OBP") ? 1.2 : 0) +
      (battingCategories.some(
        (category) => category.abbr === "K" && category.sortOrder === "low",
      )
        ? 1.1
        : 0),
    power:
      (battingSet.has("HR") ? 1 : 0) +
      (battingSet.has("RBI") ? 0.8 : 0) +
      (battingSet.has("TB") ? 1.1 : 0) +
      (battingSet.has("SLG") ? 1.1 : 0) +
      (battingSet.has("SLAM") ? 0.4 : 0),
    average:
      (battingSet.has("AVG") ? 1.1 : 0) +
      (battingSet.has("H") ? 0.8 : 0) +
      (battingSet.has("R") ? 0.5 : 0),
    speed: battingSet.has("NSB") ? 1 : 0,
    defense: battingSet.has("A") ? 0.6 : 0,
  };

  const pitcherSlots =
    (rosterSlots.SP ?? 0) + (rosterSlots.RP ?? 0) + (rosterSlots.P ?? 0);
  const starterSlotWeight = (rosterSlots.SP ?? 0) + (rosterSlots.P ?? 0) * 0.6;
  const relieverSlotWeight = (rosterSlots.RP ?? 0) + (rosterSlots.P ?? 0) * 0.4;

  const pitcherFocus = {
    starter:
      starterSlotWeight / Math.max(1, pitcherSlots) +
      (pitchingSet.has("W") ? 1 : 0) +
      (pitchingSet.has("QS") ? 1.2 : 0) +
      (pitchingSet.has("K") ? 0.9 : 0) +
      (toNumber(scoringSettings.min_innings_pitched) >= 35 ? 0.5 : 0),
    reliever:
      relieverSlotWeight / Math.max(1, pitcherSlots) +
      (pitchingSet.has("NSVH") ? 1.2 : 0) +
      (pitchingSet.has("RAPP") ? 1 : 0) +
      ((pitchingSet.has("ERA") ? 0.4 : 0) +
        (pitchingSet.has("WHIP") ? 0.4 : 0) +
        (pitchingSet.has("K/BB") ? 0.4 : 0)),
    ratio:
      (pitchingSet.has("ERA") ? 1 : 0) +
      (pitchingSet.has("WHIP") ? 1 : 0) +
      (pitchingSet.has("K/BB") ? 0.8 : 0) +
      (pitchingCategories.some(
        (category) => category.abbr === "TB" && category.sortOrder === "low",
      )
        ? 0.8
        : 0) +
      (pitchingCategories.some(
        (category) => category.abbr === "L" && category.sortOrder === "low",
      )
        ? 0.5
        : 0),
    groundball: pitchingSet.has("GIDP") ? 0.5 : 0,
  };

  const strategyNotes: string[] = [];
  if (hitterFocus.discipline >= 2.5) {
    strategyNotes.push("타자는 BB/OBP와 낮은 K 프로필을 강하게 우대합니다.");
  }
  if (hitterFocus.power >= 3) {
    strategyNotes.push("HR/TB/SLG 중심의 장타 생산력이 큰 비중을 차지합니다.");
  }
  if (hitterFocus.defense > 0) {
    strategyNotes.push(
      "Assists 카테고리 때문에 내야 수비 포지션이 추가 가치를 가집니다.",
    );
  }
  if (pitcherFocus.reliever > pitcherFocus.starter + 0.4) {
    strategyNotes.push(
      "RP 슬롯과 NSVH/RAPP 때문에 엘리트 RP를 평소보다 공격적으로 봅니다.",
    );
  } else if (pitcherFocus.starter > pitcherFocus.reliever + 0.4) {
    strategyNotes.push(
      "QS/W/K와 최소 IP 조건 때문에 안정적인 SP 볼륨이 우선입니다.",
    );
  } else {
    strategyNotes.push(
      "SP와 RP의 전략 가치가 모두 높아 한쪽으로 치우친 빌드는 불리합니다.",
    );
  }

  return {
    leagueKey,
    numTeams: toNumber(baseInfo.num_teams) || fallbackTeams,
    minInningsPitched: toNumber(scoringSettings.min_innings_pitched),
    rosterSlots,
    battingCategories,
    pitchingCategories,
    hitterFocus,
    pitcherFocus,
    strategyNotes,
  };
}

function matchPlayerNews(name: string, items: RssItem[]): RssItem[] {
  const normalizedName = normalizeName(name);
  return items.filter((item) =>
    normalizeName(item.title).includes(normalizedName),
  );
}

function newsIsRecent(item: RssItem): boolean {
  return (
    item.epoch >= Date.now() - DEFAULT_NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - Date.parse(date)) / (24 * 60 * 60 * 1000));
}

function analyzeHealth(
  transactions: TransactionRecord[],
  news: RssItem[],
  spring: SpringSnapshot | null,
): { score: number; level: "low" | "medium" | "high"; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  const recentNews = news.filter(newsIsRecent);
  const hasWbcContext = recentNews.some((item) =>
    WBC_PATTERNS.some((pattern) => pattern.test(item.title)),
  );

  for (const transaction of transactions) {
    const description = transaction.description;
    const ageDays = daysSince(transaction.date);
    if (/paternity list/i.test(description)) {
      continue;
    }
    if (/injured list/i.test(description)) {
      if (ageDays <= 60) {
        score += /60-day/i.test(description) ? 40 : 28;
      } else if (ageDays <= 180) {
        score += /60-day/i.test(description) ? 28 : 18;
      } else if (ageDays <= 365) {
        score += /60-day/i.test(description) ? 18 : 8;
      }
      notes.push(`트랜잭션(${transaction.date}): ${description}`);
    } else if (/activated .*injured list/i.test(description)) {
      if (ageDays <= 120) {
        score += 8;
      } else if (ageDays <= 365) {
        score += 4;
      }
      notes.push(`복귀 이력(${transaction.date}): ${description}`);
    }
  }

  for (const item of recentNews) {
    const title = item.title;
    if (NEGATIVE_HEALTH_PATTERNS.some((pattern) => pattern.test(title))) {
      score += 25;
      notes.push(`최근 기사: ${title}`);
      continue;
    }
    if (POSITIVE_HEALTH_PATTERNS.some((pattern) => pattern.test(title))) {
      score = Math.max(0, score - 8);
      notes.push(`긍정 신호: ${title}`);
    }
  }

  if (spring) {
    if (spring.games >= 4) {
      score = Math.max(0, score - 4);
    }

    if (spring.lastDate && !hasWbcContext) {
      const recentGap = daysSince(spring.lastDate);
      if (recentGap >= 6) {
        score += spring.games <= 2 ? 12 : 6;
        notes.push(`최근 ${recentGap}일간 spring 출전 기록이 없습니다.`);
      }
    }

    if (
      spring.hitter &&
      spring.hitter.plateAppearances < 8 &&
      score > 0 &&
      !hasWbcContext
    ) {
      score += 4;
      notes.push("시범경기 타석 수가 아직 적습니다.");
    }

    if (
      spring.pitcher &&
      spring.pitcher.outs < 6 &&
      score > 0 &&
      !hasWbcContext
    ) {
      score += 6;
      notes.push("시범경기 등판량이 아직 적습니다.");
    }
  }

  const clamped = clampNumber(score, 0, 100);
  const level = clamped >= 70 ? "high" : clamped >= 40 ? "medium" : "low";

  return { score: clamped, level, notes: notes.slice(0, 5) };
}

function analyzeSpring(
  player: YahooBoardPlayer,
  spring: SpringSnapshot | null,
  news: RssItem[],
): { delta: number; notes: string[]; isWbcActive: boolean } {
  const notes: string[] = [];
  let delta = 0;
  const isWbcActive = news.some(
    (item) =>
      newsIsRecent(item) &&
      WBC_PATTERNS.some((pattern) => pattern.test(item.title)),
  );

  if (!spring) {
    if (isWbcActive) {
      notes.push(
        "WBC 출전 정황이 있어 spring 출전량 부족을 감점하지 않았습니다.",
      );
    } else {
      notes.push("시범경기 로그가 적어 샘플이 부족합니다.");
    }
    return { delta, notes, isWbcActive };
  }

  if (spring.hitter) {
    const hitter = spring.hitter;
    const pa = hitter.plateAppearances;
    const walkRate = pa > 0 ? hitter.walks / pa : 0;
    const strikeoutRate = pa > 0 ? hitter.strikeOuts / pa : 0;

    notes.push(
      `Spring: ${spring.games}G, ${pa}PA, ${hitter.homeRuns}HR, BB% ${formatDecimal(
        walkRate * 100,
        1,
      )}, K% ${formatDecimal(strikeoutRate * 100, 1)}`,
    );

    if (pa >= 12 && hitter.homeRuns >= 2) {
      delta += 1;
      notes.push("장타 생산이 초반부터 확인됩니다.");
    }
    if (pa >= 12 && walkRate >= 0.12 && strikeoutRate <= 0.2) {
      delta += 1;
      notes.push("타석 접근이 안정적입니다.");
    }
    if (pa >= 12 && strikeoutRate >= 0.32) {
      delta -= 1;
      notes.push("삼진률이 높아 작은 샘플이지만 주의가 필요합니다.");
    }
  }

  if (spring.pitcher) {
    const pitcher = spring.pitcher;
    const bf = pitcher.battersFaced;
    const kRate = bf > 0 ? pitcher.strikeOuts / bf : 0;
    const walkRate = bf > 0 ? pitcher.walks / bf : 0;
    const kbDiff = kRate - walkRate;

    notes.push(
      `Spring: ${spring.games}G, ${parseIpFromOuts(
        pitcher.outs,
      )}IP, ${pitcher.strikeOuts}K, ${pitcher.walks}BB, ERA ${formatDecimal(
        pitcher.era,
        2,
      )}, WHIP ${formatDecimal(pitcher.whip, 2)}`,
    );

    if (bf >= 12 && kbDiff >= 0.2) {
      delta += 1;
      notes.push("초반 K-BB%가 좋습니다.");
    }
    if (pitcher.outs >= 12 && pitcher.whip <= 1.1) {
      delta += 1;
      notes.push("기본 제구/출루 억제 신호가 안정적입니다.");
    }
    if (bf >= 12 && walkRate >= 0.12) {
      delta -= 1;
      notes.push("볼넷 비율이 높습니다.");
    }
  }

  if (isWbcActive) {
    notes.push("최근 MLB 기사 기준 WBC 관련 활동이 확인됩니다.");
  }

  return { delta, notes, isWbcActive };
}

function analyzeQuality(quality: SpringQualitySnapshot | null): {
  delta: number;
  notes: string[];
} {
  const notes: string[] = [];
  let delta = 0;

  if (!quality) {
    return { delta, notes };
  }

  if (quality.hitter) {
    const hitter = quality.hitter;
    const launchSpeed =
      hitter.averageLaunchSpeed === null
        ? "-"
        : `${formatDecimal(hitter.averageLaunchSpeed, 1)} mph`;
    const launchAngle =
      hitter.averageLaunchAngle === null
        ? "-"
        : `${formatDecimal(hitter.averageLaunchAngle, 1)} deg`;
    const distance =
      hitter.averageDistance === null
        ? "-"
        : `${formatDecimal(hitter.averageDistance, 0)} ft`;

    notes.push(
      `Quality: ${hitter.battedBallEvents} BBE, EV ${launchSpeed}, LA ${launchAngle}, Dist ${distance}`,
    );

    if (
      hitter.battedBallEvents >= 8 &&
      (hitter.averageLaunchSpeed ?? 0) >= 92
    ) {
      delta += 1;
      notes.push("타구 질이 강합니다.");
    }
    if (hitter.battedBallEvents >= 8 && (hitter.averageDistance ?? 0) >= 180) {
      delta += 1;
      notes.push("컨택 당 장타 잠재력이 좋습니다.");
    }
    if (
      hitter.battedBallEvents >= 8 &&
      (hitter.averageLaunchSpeed ?? 999) <= 85 &&
      (hitter.averageDistance ?? 999) <= 145
    ) {
      delta -= 1;
      notes.push("타구 질이 아직 눌려 있습니다.");
    }
  }

  if (quality.pitcher) {
    const pitcher = quality.pitcher;
    const pitchLabel = pitcher.pitchCode
      ? `${pitcher.pitchName ?? pitcher.pitchCode} ${pitcher.pitchCode}`
      : (pitcher.pitchName ?? "Primary");
    const velo =
      pitcher.releaseSpeed === null
        ? "-"
        : `${formatDecimal(pitcher.releaseSpeed, 1)} mph`;
    const effective =
      pitcher.effectiveSpeed === null
        ? "-"
        : `${formatDecimal(pitcher.effectiveSpeed, 1)} mph`;
    const spin =
      pitcher.releaseSpinRate === null
        ? "-"
        : `${formatDecimal(pitcher.releaseSpinRate, 0)} rpm`;

    notes.push(
      `Quality: ${pitchLabel}, velo ${velo}, eff ${effective}, spin ${spin}, n=${pitcher.sampleSize}`,
    );

    if (pitcher.sampleSize >= 15 && (pitcher.releaseSpeed ?? 0) >= 96) {
      delta += 1;
      notes.push("주무기 구속이 강합니다.");
    }
    if (
      pitcher.sampleSize >= 15 &&
      (pitcher.pitchCode === "FF" || pitcher.pitchCode === "SI") &&
      (pitcher.releaseSpinRate ?? 0) >= 2300
    ) {
      delta += 1;
      notes.push("패스트볼 품질 신호가 좋습니다.");
    }
    if (pitcher.sampleSize >= 15 && (pitcher.releaseSpeed ?? 999) <= 92.5) {
      delta -= 1;
      notes.push("주무기 구속이 평범해 보입니다.");
    }
  }

  return {
    delta: clampNumber(delta, -2, 2),
    notes: notes.slice(0, 3),
  };
}

function analyzeRoleNews(
  player: YahooBoardPlayer,
  news: RssItem[],
): { delta: number; notes: string[] } {
  const recentNews = news.filter(newsIsRecent);
  const notes: string[] = [];
  let delta = 0;

  for (const item of recentNews) {
    const title = item.title;
    if (POSITIVE_ROLE_PATTERNS.some((pattern) => pattern.test(title))) {
      delta += 1;
      notes.push(`역할 호재: ${title}`);
      continue;
    }
    if (NEGATIVE_ROLE_PATTERNS.some((pattern) => pattern.test(title))) {
      delta -= 1;
      notes.push(`역할 주의: ${title}`);
    }
  }

  if (player.positionType === "P") {
    for (const item of recentNews) {
      if (/closer|save chances|ninth inning/i.test(item.title)) {
        delta += 1;
        notes.push(`역할 호재: ${item.title}`);
        break;
      }
      if (/committee|share save chances/i.test(item.title)) {
        delta -= 1;
        notes.push(`역할 주의: ${item.title}`);
        break;
      }
    }
  }

  return {
    delta: clampNumber(delta, -2, 2),
    notes: notes.slice(0, 2),
  };
}

function getEligiblePositions(player: YahooBoardPlayer): string[] {
  return player.displayPosition
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      if (value === "P") {
        return ["SP", "RP"];
      }
      return [value];
    });
}

function buildValueRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function normalizeRangeScore(
  value: number,
  range: { min: number; max: number },
  direction: "high" | "low" = "high",
): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.max === range.min
  ) {
    return 0.5;
  }
  const normalized = (value - range.min) / (range.max - range.min);
  const clamped = clampNumber(normalized, 0, 1);
  return direction === "low" ? 1 - clamped : clamped;
}

function estimateAssistRate(player: YahooBoardPlayer): number {
  const positions = getEligiblePositions(player);
  if (positions.includes("SS")) return 2.6;
  if (positions.includes("2B")) return 2.2;
  if (positions.includes("3B")) return 1.8;
  if (positions.includes("C")) return 0.8;
  if (positions.includes("1B")) return 0.5;
  return 0.2;
}

function classifyPitcherRole(
  player: YahooBoardPlayer,
  season: SeasonBaseline | null,
): "starter" | "reliever" | "swing" {
  const positions = getEligiblePositions(player);
  if (positions.includes("SP") && !positions.includes("RP")) {
    return "starter";
  }
  if (positions.includes("RP") && !positions.includes("SP")) {
    return "reliever";
  }

  const pitcher = season?.pitcher;
  if (!pitcher) {
    return positions.includes("RP") ? "reliever" : "starter";
  }

  const gamesStarted = pitcher.gamesStarted;
  const gamesPitched = Math.max(pitcher.gamesPitched, 1);
  const reliefAppearances = Math.max(0, gamesPitched - gamesStarted);
  const leverageEvents =
    pitcher.saves + pitcher.holds + Math.max(0, pitcher.blownSaves);

  if (gamesStarted >= 8 && gamesStarted / gamesPitched >= 0.4) {
    return "starter";
  }
  if (reliefAppearances >= 20 || leverageEvents >= 8) {
    return "reliever";
  }
  return "swing";
}

function computeScarcityMap(
  evaluations: PlayerEvaluation[],
  context: LeagueContext,
): Record<string, number> {
  const scarcity: Record<string, number> = {};
  const hitters = evaluations.filter(
    (entry) => entry.player.positionType !== "P",
  );
  const pitchers = evaluations.filter(
    (entry) => entry.player.positionType === "P",
  );
  const totalHitterSlots = TRACKED_HITTER_POSITIONS.reduce(
    (sum, position) => sum + (context.rosterSlots[position] ?? 0),
    0,
  );
  const totalPitcherSlots = TRACKED_PITCHER_POSITIONS.reduce(
    (sum, position) => sum + (context.rosterSlots[position] ?? 0),
    0,
  );

  for (const position of TRACKED_HITTER_POSITIONS) {
    const supply = hitters.filter((entry) =>
      getEligiblePositions(entry.player).includes(position),
    ).length;
    const slotShare =
      (context.rosterSlots[position] ?? 0) / Math.max(1, totalHitterSlots);
    const supplyShare = supply / Math.max(1, hitters.length);
    const raw = supplyShare > 0 ? slotShare / supplyShare : 2;
    scarcity[position] = clampNumber((raw - 1) * 1.8, -1, 2.5);
  }

  for (const position of TRACKED_PITCHER_POSITIONS) {
    const supply = pitchers.filter((entry) =>
      getEligiblePositions(entry.player).includes(position),
    ).length;
    const slotShare =
      (context.rosterSlots[position] ?? 0) / Math.max(1, totalPitcherSlots);
    const supplyShare = supply / Math.max(1, pitchers.length);
    const raw = supplyShare > 0 ? slotShare / supplyShare : 2;
    scarcity[position] = clampNumber((raw - 1) * 1.6, -1, 2);
  }

  return scarcity;
}

function buildMetricRanges(evaluations: PlayerEvaluation[]) {
  const hitterMetrics = {
    runPace: [] as number[],
    hitPace: [] as number[],
    hrPace: [] as number[],
    rbiPace: [] as number[],
    bbRate: [] as number[],
    kRate: [] as number[],
    tbPace: [] as number[],
    avg: [] as number[],
    obp: [] as number[],
    slg: [] as number[],
    nsbPace: [] as number[],
    assistRate: [] as number[],
  };
  const pitcherMetrics = {
    winRate: [] as number[],
    lossRate: [] as number[],
    kPer9: [] as number[],
    gidpPer9: [] as number[],
    tbAllowedPer9: [] as number[],
    era: [] as number[],
    whip: [] as number[],
    kbb: [] as number[],
    ipPerStart: [] as number[],
    qsProxy: [] as number[],
    reliefApps: [] as number[],
    nsvhRate: [] as number[],
  };

  for (const entry of evaluations) {
    const season = entry.season;
    if (season?.hitter) {
      const hitter = season.hitter;
      const pa = Math.max(hitter.plateAppearances, 1);
      const games = Math.max(hitter.gamesPlayed, 1);
      hitterMetrics.runPace.push((hitter.runs / pa) * 650);
      hitterMetrics.hitPace.push((hitter.hits / pa) * 650);
      hitterMetrics.hrPace.push((hitter.homeRuns / pa) * 650);
      hitterMetrics.rbiPace.push((hitter.rbi / pa) * 650);
      hitterMetrics.bbRate.push(hitter.walks / pa);
      hitterMetrics.kRate.push(hitter.strikeOuts / pa);
      hitterMetrics.tbPace.push((hitter.totalBases / pa) * 650);
      hitterMetrics.avg.push(hitter.avg);
      hitterMetrics.obp.push(hitter.obp);
      hitterMetrics.slg.push(hitter.slg);
      hitterMetrics.nsbPace.push(
        ((hitter.stolenBases - hitter.caughtStealing) / pa) * 650,
      );
      hitterMetrics.assistRate.push(
        season.fielding?.games
          ? season.fielding.assists / Math.max(season.fielding.games, 1)
          : estimateAssistRate(entry.player) / Math.max(games / 162, 0.6),
      );
    }

    if (season?.pitcher) {
      const pitcher = season.pitcher;
      const innings = Math.max(pitcher.outs / 3, 1);
      const gamesStarted = Math.max(pitcher.gamesStarted, 1);
      const reliefApps = Math.max(
        0,
        pitcher.gamesPitched - pitcher.gamesStarted,
      );
      pitcherMetrics.winRate.push(
        pitcher.wins / Math.max(pitcher.gamesStarted, 1),
      );
      pitcherMetrics.lossRate.push(
        pitcher.losses / Math.max(pitcher.gamesStarted || reliefApps, 1),
      );
      pitcherMetrics.kPer9.push((pitcher.strikeOuts / innings) * 9);
      pitcherMetrics.gidpPer9.push(
        (pitcher.groundIntoDoublePlay / innings) * 9,
      );
      pitcherMetrics.tbAllowedPer9.push(
        (pitcher.totalBasesAllowed / innings) * 9,
      );
      pitcherMetrics.era.push(pitcher.era);
      pitcherMetrics.whip.push(pitcher.whip);
      pitcherMetrics.kbb.push(pitcher.strikeoutWalkRatio);
      pitcherMetrics.ipPerStart.push(pitcher.outs / 3 / gamesStarted);
      pitcherMetrics.qsProxy.push(
        (pitcher.outs / 3 / gamesStarted) *
          clampNumber((4.7 - pitcher.era) / 2, 0, 1.5),
      );
      pitcherMetrics.reliefApps.push(reliefApps);
      pitcherMetrics.nsvhRate.push(
        (pitcher.saves + pitcher.holds - pitcher.blownSaves) /
          Math.max(reliefApps, 1),
      );
    }
  }

  return {
    hitter: Object.fromEntries(
      Object.entries(hitterMetrics).map(([key, values]) => [
        key,
        buildValueRange(values),
      ]),
    ) as Record<keyof typeof hitterMetrics, { min: number; max: number }>,
    pitcher: Object.fromEntries(
      Object.entries(pitcherMetrics).map(([key, values]) => [
        key,
        buildValueRange(values),
      ]),
    ) as Record<keyof typeof pitcherMetrics, { min: number; max: number }>,
  };
}

function summarizeFitScore(score: number): string {
  if (score >= 2) return `+${score} fit`;
  if (score <= -2) return `${score} fit`;
  if (score === 1) return "+1 fit";
  if (score === -1) return "-1 fit";
  return "neutral";
}

function applyLeagueContext(
  evaluations: PlayerEvaluation[],
  context: LeagueContext,
): PlayerEvaluation[] {
  const scarcityMap = computeScarcityMap(evaluations, context);
  const ranges = buildMetricRanges(evaluations);

  return evaluations.map((entry) => {
    const fitNotes: string[] = [];
    let positionScarcityScore = 0;
    let categoryFitScore = 0;
    let roleFitScore = 0;

    const eligiblePositions = getEligiblePositions(entry.player).filter(
      (position) =>
        TRACKED_HITTER_POSITIONS.includes(
          position as (typeof TRACKED_HITTER_POSITIONS)[number],
        ) ||
        TRACKED_PITCHER_POSITIONS.includes(
          position as (typeof TRACKED_PITCHER_POSITIONS)[number],
        ),
    );

    if (eligiblePositions.length > 0) {
      const scarcityValues = eligiblePositions.map(
        (position) => scarcityMap[position] ?? 0,
      );
      positionScarcityScore = Math.round(
        clampNumber(Math.max(...scarcityValues), -1, 2),
      );
      const scarcePosition = eligiblePositions
        .map((position) => ({ position, score: scarcityMap[position] ?? 0 }))
        .sort((a, b) => b.score - a.score)[0];

      if (scarcePosition && scarcePosition.score >= 0.75) {
        fitNotes.push(`희소 포지션 보너스: ${scarcePosition.position}`);
      } else if (scarcePosition && scarcePosition.score <= -0.5) {
        fitNotes.push(`깊은 포지션: ${scarcePosition.position}`);
      }
    }

    if (entry.season?.hitter) {
      const hitter = entry.season.hitter;
      const pa = Math.max(hitter.plateAppearances, 1);
      const games = Math.max(hitter.gamesPlayed, 1);
      const assistRate = entry.season.fielding?.games
        ? entry.season.fielding.assists /
          Math.max(entry.season.fielding.games, 1)
        : estimateAssistRate(entry.player) / Math.max(games / 162, 0.6);

      const disciplineScore =
        (normalizeRangeScore(hitter.walks / pa, ranges.hitter.bbRate) +
          normalizeRangeScore(hitter.obp, ranges.hitter.obp) +
          normalizeRangeScore(
            hitter.strikeOuts / pa,
            ranges.hitter.kRate,
            "low",
          )) /
        3;
      const powerScore =
        (normalizeRangeScore(
          (hitter.homeRuns / pa) * 650,
          ranges.hitter.hrPace,
        ) +
          normalizeRangeScore(
            (hitter.totalBases / pa) * 650,
            ranges.hitter.tbPace,
          ) +
          normalizeRangeScore(hitter.slg, ranges.hitter.slg)) /
        3;
      const averageScore =
        (normalizeRangeScore(hitter.avg, ranges.hitter.avg) +
          normalizeRangeScore((hitter.hits / pa) * 650, ranges.hitter.hitPace) +
          normalizeRangeScore(
            (hitter.runs / pa) * 650,
            ranges.hitter.runPace,
          )) /
        3;
      const speedScore = normalizeRangeScore(
        ((hitter.stolenBases - hitter.caughtStealing) / pa) * 650,
        ranges.hitter.nsbPace,
      );
      const defenseScore = normalizeRangeScore(
        assistRate,
        ranges.hitter.assistRate,
      );

      const totalWeight =
        context.hitterFocus.discipline +
        context.hitterFocus.power +
        context.hitterFocus.average +
        context.hitterFocus.speed +
        context.hitterFocus.defense;
      const weightedScore =
        disciplineScore * context.hitterFocus.discipline +
        powerScore * context.hitterFocus.power +
        averageScore * context.hitterFocus.average +
        speedScore * context.hitterFocus.speed +
        defenseScore * context.hitterFocus.defense;
      const fitValue = totalWeight > 0 ? weightedScore / totalWeight : 0.5;
      categoryFitScore = Math.round((fitValue - 0.5) * 4);

      const components = [
        {
          label: "BB/OBP/낮은 K",
          value: disciplineScore,
          weight: context.hitterFocus.discipline,
        },
        {
          label: "HR/TB/SLG",
          value: powerScore,
          weight: context.hitterFocus.power,
        },
        {
          label: "AVG/H/R",
          value: averageScore,
          weight: context.hitterFocus.average,
        },
        { label: "NSB", value: speedScore, weight: context.hitterFocus.speed },
        {
          label: "A",
          value: defenseScore,
          weight: context.hitterFocus.defense,
        },
      ].filter((component) => component.weight > 0);

      const strong = [...components].sort((a, b) => b.value - a.value)[0];
      const weak = [...components].sort((a, b) => a.value - b.value)[0];
      if (strong && strong.value >= 0.7) {
        fitNotes.push(`카테고리 강점: ${strong.label}`);
      }
      if (weak && weak.value <= 0.3 && weak.weight >= 0.8) {
        fitNotes.push(`카테고리 주의: ${weak.label}`);
      }
    }

    if (entry.season?.pitcher) {
      const pitcher = entry.season.pitcher;
      const innings = Math.max(pitcher.outs / 3, 1);
      const gamesStarted = Math.max(pitcher.gamesStarted, 1);
      const reliefApps = Math.max(
        0,
        pitcher.gamesPitched - pitcher.gamesStarted,
      );
      const role = classifyPitcherRole(entry.player, entry.season);

      const starterComponent =
        (normalizeRangeScore(
          pitcher.wins / gamesStarted,
          ranges.pitcher.winRate,
        ) +
          normalizeRangeScore(
            (pitcher.strikeOuts / innings) * 9,
            ranges.pitcher.kPer9,
          ) +
          normalizeRangeScore(
            pitcher.outs / 3 / gamesStarted,
            ranges.pitcher.ipPerStart,
          ) +
          normalizeRangeScore(
            (pitcher.outs / 3 / gamesStarted) *
              clampNumber((4.7 - pitcher.era) / 2, 0, 1.5),
            ranges.pitcher.qsProxy,
          )) /
        4;
      const relieverComponent =
        (normalizeRangeScore(
          (pitcher.saves + pitcher.holds - pitcher.blownSaves) /
            Math.max(reliefApps, 1),
          ranges.pitcher.nsvhRate,
        ) +
          normalizeRangeScore(reliefApps, ranges.pitcher.reliefApps) +
          normalizeRangeScore(
            (pitcher.strikeOuts / innings) * 9,
            ranges.pitcher.kPer9,
          )) /
        3;
      const ratioComponent =
        (normalizeRangeScore(pitcher.era, ranges.pitcher.era, "low") +
          normalizeRangeScore(pitcher.whip, ranges.pitcher.whip, "low") +
          normalizeRangeScore(pitcher.strikeoutWalkRatio, ranges.pitcher.kbb) +
          normalizeRangeScore(
            (pitcher.totalBasesAllowed / innings) * 9,
            ranges.pitcher.tbAllowedPer9,
            "low",
          ) +
          normalizeRangeScore(
            pitcher.losses / Math.max(pitcher.gamesStarted || reliefApps, 1),
            ranges.pitcher.lossRate,
            "low",
          )) /
        5;
      const groundballComponent = normalizeRangeScore(
        (pitcher.groundIntoDoublePlay / innings) * 9,
        ranges.pitcher.gidpPer9,
      );

      const starterWeight =
        role === "starter"
          ? context.pitcherFocus.starter
          : role === "swing"
            ? context.pitcherFocus.starter * 0.65
            : context.pitcherFocus.starter * 0.2;
      const relieverWeight =
        role === "reliever"
          ? context.pitcherFocus.reliever
          : role === "swing"
            ? context.pitcherFocus.reliever * 0.65
            : context.pitcherFocus.reliever * 0.2;
      const totalWeight =
        starterWeight +
        relieverWeight +
        context.pitcherFocus.ratio +
        context.pitcherFocus.groundball;
      const weightedScore =
        starterComponent * starterWeight +
        relieverComponent * relieverWeight +
        ratioComponent * context.pitcherFocus.ratio +
        groundballComponent * context.pitcherFocus.groundball;
      const fitValue = totalWeight > 0 ? weightedScore / totalWeight : 0.5;
      categoryFitScore = Math.round((fitValue - 0.5) * 4);

      const roleBias =
        context.pitcherFocus.reliever - context.pitcherFocus.starter;
      if (role === "reliever") {
        roleFitScore = Math.round(clampNumber(roleBias * 0.6, -1, 2));
      } else if (role === "starter") {
        roleFitScore = Math.round(clampNumber(-roleBias * 0.6, -1, 2));
      } else {
        roleFitScore = 0;
      }

      const components = [
        { label: "QS/W/K", value: starterComponent, weight: starterWeight },
        {
          label: "NSVH/RAPP",
          value: relieverComponent,
          weight: relieverWeight,
        },
        {
          label: "ERA/WHIP/KBB",
          value: ratioComponent,
          weight: context.pitcherFocus.ratio,
        },
        {
          label: "GIDP",
          value: groundballComponent,
          weight: context.pitcherFocus.groundball,
        },
      ].filter((component) => component.weight > 0);
      const strong = [...components].sort((a, b) => b.value - a.value)[0];
      const weak = [...components].sort((a, b) => a.value - b.value)[0];

      if (strong && strong.value >= 0.7) {
        fitNotes.push(`카테고리 강점: ${strong.label}`);
      }
      if (weak && weak.value <= 0.3 && weak.weight >= 0.8) {
        fitNotes.push(`카테고리 주의: ${weak.label}`);
      }
      if (roleFitScore >= 1) {
        fitNotes.push(
          role === "reliever"
            ? "리그 구조상 RP 가치가 높습니다."
            : "리그 구조상 안정적 SP 볼륨이 중요합니다.",
        );
      }
    }

    const leagueFitScore = clampNumber(
      categoryFitScore + positionScarcityScore + roleFitScore,
      -3,
      4,
    );
    const notes = [...entry.notes, ...fitNotes].slice(0, 9);
    const recommendation = determineRecommendation(
      clampNumber(
        entry.expectationDelta + Math.round(leagueFitScore / 2),
        -5,
        5,
      ),
      entry.healthRiskScore,
    );
    const priorityScore =
      1000 -
      entry.player.rank * 10 +
      entry.expectationDelta * 24 +
      leagueFitScore * 18 -
      entry.healthRiskScore;

    return {
      ...entry,
      fitNotes: fitNotes.slice(0, 4),
      notes,
      positionScarcityScore,
      categoryFitScore,
      roleFitScore,
      leagueFitScore,
      recommendation,
      priorityScore,
    };
  });
}

function determineRecommendation(
  expectationDelta: number,
  healthRiskScore: number,
): "target" | "hold" | "caution" | "fade" {
  if (healthRiskScore >= 70) {
    return "fade";
  }
  if (healthRiskScore >= 40) {
    return "caution";
  }
  if (expectationDelta >= 2) {
    return "target";
  }
  if (expectationDelta >= 1 && healthRiskScore < 25) {
    return "target";
  }
  if (expectationDelta <= -2) {
    return "caution";
  }
  return "hold";
}

async function evaluatePlayer(
  player: YahooBoardPlayer,
  newsFeed: RssItem[],
): Promise<PlayerEvaluation> {
  try {
    const mlbPerson = await searchMlbPerson(player.cleanName);
    const news = matchPlayerNews(player.cleanName, newsFeed);

    if (!mlbPerson) {
      return {
        player,
        mlbPerson: null,
        spring: null,
        quality: null,
        season: null,
        transactions: [],
        news,
        healthRiskScore: 20,
        healthLevel: "low",
        expectationDelta: 0,
        recommendation: "hold",
        notes: ["MLB player mapping에 실패해 뉴스 기반만 반영했습니다."],
        fitNotes: [],
        positionScarcityScore: 0,
        categoryFitScore: 0,
        roleFitScore: 0,
        leagueFitScore: 0,
        priorityScore: 1000 - player.rank * 10,
      };
    }

    const [spring, quality, season, transactions] = await Promise.all([
      fetchSpringSnapshot(mlbPerson.id, player.positionType).catch(() => null),
      fetchSpringQuality(mlbPerson.id, player.positionType).catch(() => null),
      fetchSeasonBaseline(mlbPerson.id, player.positionType).catch(() => null),
      fetchTransactions(mlbPerson.id).catch(() => []),
    ]);

    const health = analyzeHealth(transactions, news, spring);
    const springSignal = analyzeSpring(player, spring, news);
    const qualitySignal = analyzeQuality(quality);
    const roleSignal = analyzeRoleNews(player, news);
    let expectationDelta =
      springSignal.delta + qualitySignal.delta + roleSignal.delta;

    if (health.score >= 60) {
      expectationDelta -= 3;
    } else if (health.score >= 35) {
      expectationDelta -= 1;
    }

    if (
      news.some(
        (item) =>
          newsIsRecent(item) &&
          POSITIVE_HEALTH_PATTERNS.some((pattern) => pattern.test(item.title)),
      )
    ) {
      expectationDelta += 1;
    }

    expectationDelta = clampNumber(expectationDelta, -5, 5);

    const notes = [
      ...springSignal.notes,
      ...qualitySignal.notes,
      ...roleSignal.notes,
      ...health.notes,
    ].slice(0, 7);
    const recommendation = determineRecommendation(
      expectationDelta,
      health.score,
    );
    const priorityScore =
      1000 - player.rank * 10 + expectationDelta * 24 - health.score;

    return {
      player,
      mlbPerson,
      spring,
      quality,
      season,
      transactions,
      news,
      healthRiskScore: health.score,
      healthLevel: health.level,
      expectationDelta,
      recommendation,
      notes,
      fitNotes: [],
      positionScarcityScore: 0,
      categoryFitScore: 0,
      roleFitScore: 0,
      leagueFitScore: 0,
      priorityScore,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 분석 실패";
    return {
      player,
      mlbPerson: null,
      spring: null,
      quality: null,
      season: null,
      transactions: [],
      news: [],
      healthRiskScore: 25,
      healthLevel: "low",
      expectationDelta: 0,
      recommendation: "hold",
      notes: [`분석 실패: ${message}`],
      fitNotes: [],
      positionScarcityScore: 0,
      categoryFitScore: 0,
      roleFitScore: 0,
      leagueFitScore: 0,
      priorityScore: 1000 - player.rank * 10,
    };
  }
}

function roundWindow(
  round: number,
  pick: number,
): { min: number; max: number } {
  const padding = round === 0 ? 4 : 6;
  return {
    min: Math.max(1, pick - padding),
    max: pick + padding,
  };
}

function summarizeDelta(delta: number): string {
  if (delta >= 2) return `+${delta} up`;
  if (delta <= -2) return `${delta} down`;
  if (delta === 1) return "+1 up";
  if (delta === -1) return "-1 down";
  return "hold";
}

function recIcon(rec: string): string {
  if (rec === "target") return "🟢";
  if (rec === "hold") return "🟡";
  if (rec === "caution") return "🟠";
  return "🔴";
}

function getRoundCandidates(
  evaluations: PlayerEvaluation[],
  round: number,
  pick: number,
): PlayerEvaluation[] {
  const window = roundWindow(round, pick);
  return evaluations
    .filter(
      (entry) =>
        entry.player.rank >= window.min && entry.player.rank <= window.max,
    )
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);
}

function buildRoundPlans(
  evaluations: PlayerEvaluation[],
  myPicks: number[],
): RoundPlan[] {
  const used = new Set<string>();

  return myPicks.map((pick, roundIndex) => {
    const candidates = getRoundCandidates(evaluations, roundIndex, pick);
    const board: PlayerEvaluation[] = [];

    for (const candidate of candidates) {
      const key = candidate.player.cleanName;
      if (used.has(key)) {
        continue;
      }
      used.add(key);
      board.push(candidate);
      if (board.length === 3) {
        break;
      }
    }

    return {
      round: roundIndex + 1,
      pick,
      candidates,
      board: board.length > 0 ? board : candidates.slice(0, 3),
    };
  });
}

function healthReason(entry: PlayerEvaluation): string {
  return (
    entry.notes.find((note) =>
      /기사|트랜잭션|복귀 이력|출전 기록/.test(note),
    ) ??
    entry.notes[0] ??
    "-"
  );
}

function summarizeScarcityMap(scarcityMap: Record<string, number>): string {
  return Object.entries(scarcityMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([position, score]) => `${position} ${score >= 1.5 ? "high" : "mid"}`)
    .join(", ");
}

function springOneLiner(entry: PlayerEvaluation): string {
  if (!entry.spring) return "";
  if (entry.spring.hitter) {
    const h = entry.spring.hitter;
    const pa = h.plateAppearances;
    return `${entry.spring.games}G ${pa}PA ${h.homeRuns}HR .${(h.onBasePercentage * 1000).toFixed(0).padStart(3, "0")} OBP K${formatDecimal((pa > 0 ? h.strikeOuts / pa : 0) * 100, 0)}%`;
  }
  if (entry.spring.pitcher) {
    const p = entry.spring.pitcher;
    return `${entry.spring.games}G ${parseIpFromOuts(p.outs)}IP ${p.strikeOuts}K ${p.walks}BB ${formatDecimal(p.era, 2)} ERA`;
  }
  return "";
}

function qualityOneLiner(entry: PlayerEvaluation): string {
  const qNote = entry.notes.find((n) => n.startsWith("Quality:"));
  if (!qNote) return "";
  return qNote.replace("Quality: ", "");
}

function fitBadge(score: number): string {
  if (score >= 2) return "**A+**";
  if (score >= 1) return "**A**";
  if (score === 0) return "B";
  if (score >= -1) return "C";
  return "D";
}

function deltaBadge(delta: number): string {
  if (delta >= 3) return "**+++**";
  if (delta === 2) return "**++**";
  if (delta === 1) return "+";
  if (delta === 0) return "—";
  if (delta === -1) return "−";
  return "**−−**";
}

function healthBadge(score: number): string {
  if (score >= 70) return "🔴";
  if (score >= 40) return "🟠";
  if (score >= 20) return "🟡";
  return "🟢";
}

function phaseLabel(round: number): string {
  if (round <= 3) return "Core Build";
  if (round <= 7) return "Foundation";
  if (round <= 13) return "Depth Fill";
  return "Upside Bets";
}

function posLabel(entry: PlayerEvaluation): string {
  const pos = entry.player.displayPosition;
  const type = entry.player.positionType;
  if (type === "P") {
    return pos.includes("SP") && pos.includes("RP")
      ? "SP/RP"
      : pos.split(",")[0];
  }
  return pos.length > 6 ? pos.split(",").slice(0, 2).join("/") : pos;
}

function keyNote(entry: PlayerEvaluation): string {
  const fitNote = entry.fitNotes[0] ?? "";
  const springNote = entry.notes.find(
    (n) =>
      n.includes("장타 생산") ||
      n.includes("타석 접근") ||
      n.includes("K-BB%") ||
      n.includes("제구") ||
      n.includes("구속") ||
      n.includes("타구 질"),
  );
  const healthNote = entry.notes.find(
    (n) => n.includes("트랜잭션") || n.includes("출전 기록이 없습니다"),
  );

  const parts: string[] = [];
  if (springNote) parts.push(truncate(springNote, 30));
  if (fitNote) parts.push(truncate(fitNote, 30));
  if (healthNote && entry.healthRiskScore >= 20)
    parts.push(truncate(healthNote, 30));
  return parts.slice(0, 2).join(" · ") || "—";
}

function generateMarkdown(
  evaluations: PlayerEvaluation[],
  myPicks: number[],
  context: LeagueContext,
  options: {
    leagueKey: string;
    count: number;
    myPick: number;
    numTeams: number;
    rounds: number;
  },
): string {
  const L: string[] = [];
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const roundPlans = buildRoundPlans(evaluations, myPicks);
  const scarcityMap = computeScarcityMap(evaluations, context);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COVER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("# 2026 Fantasy Baseball — Final Draft Plan");
  L.push("");
  L.push("|||");
  L.push("|:---|:---|");
  L.push(`| **리그** | 리그 네이밍 후원 환영합니다 (${options.leagueKey}) |`);
  L.push(
    `| **드래프트** | 3/20 (금) 밤 10시 · 스네이크 · ${options.numTeams}팀 |`,
  );
  L.push(`| **내 순번** | **${options.myPick}번** |`);
  L.push(
    `| **로스터** | C, 1B, 2B, 3B, SS, OF×3, Util, SP×4, RP×4, P, BN×2, IL×2 |`,
  );
  L.push(`| **최소 IP** | ${context.minInningsPitched} |`);
  L.push(
    `| **분석 기반** | Spring Training GL + Statcast Quality + Team RSS + IL History |`,
  );
  L.push(`| **생성** | ${now} |`);
  L.push("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LEAGUE LENS (compact)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 리그 특성 요약");
  L.push("");
  for (const note of context.strategyNotes) {
    L.push(`> ${note}`);
  }
  L.push(`> 희소 포지션: ${summarizeScarcityMap(scarcityMap)}`);
  L.push("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DRAFT BOARD — one-page cheat sheet
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## DRAFT BOARD — 한눈에 보기");
  L.push("");
  L.push(
    "드래프트 당일 이 표 하나만 보세요. 1순위를 먼저 시도하고, 뽑히면 2→3 순서로.",
  );
  L.push("");
  L.push("| R | Pick | Phase | 1순위 | 2순위 | 3순위 |");
  L.push("|:---:|---:|:---|:---|:---|:---|");
  for (const plan of roundPlans) {
    const phase = phaseLabel(plan.round);
    const board = [
      ...plan.board,
      ...Array.from({ length: 3 - plan.board.length }, () => null),
    ];
    const fmt = (e: PlayerEvaluation | null) => {
      if (!e) return "—";
      return `${recIcon(e.recommendation)} **${e.player.name}** ${posLabel(e)} ${deltaBadge(e.expectationDelta)}`;
    };
    L.push(
      `| ${plan.round} | ${plan.pick} | ${phase} | ${fmt(board[0])} | ${fmt(board[1])} | ${fmt(board[2])} |`,
    );
  }
  L.push("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // KEY PRINCIPLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 핵심 원칙");
  L.push("");
  L.push("1. **1R은 순수 BPA** — 포지션 무시, 가장 높은 가치의 선수");
  L.push("2. **C/3B는 4R 이내** — 이후 질적 낭떠러지 (Riley→Suárez 급 갭)");
  L.push(
    "3. **SP 4~6R에 시작** — Skubal/Skenes/Crochet 외에도 Peralta/Cease/Valdez 층이 두꺼움",
  );
  L.push("4. **RP는 6R 이후** — Mason Miller 제외, 클로저/셋업 대체재 풍부");
  L.push("5. **OF는 후반까지 여유** — Top 250에 30+명, 서두르지 말 것");
  L.push("6. **BB/낮은 K 타자 선호** — 리그 카테고리상 컨택 히터에 가산점");
  L.push(
    "7. **A(어시스트) 보너스** — 내야수(SS/2B/3B) > OF, 멀티포지션 내야수 고평가",
  );
  L.push("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RISERS & FALLERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 기대치 변동 TOP");
  L.push("");

  const sortedByDelta = [...evaluations].sort(
    (a, b) =>
      b.expectationDelta - a.expectationDelta || a.player.rank - b.player.rank,
  );

  const risers = sortedByDelta
    .filter((e) => e.expectationDelta >= 2)
    .slice(0, 10);
  const fallers = [...sortedByDelta]
    .reverse()
    .filter((e) => e.expectationDelta <= -1)
    .slice(0, 6);

  L.push("### 상향 (노려볼 선수)");
  L.push("");
  L.push("| # | Player | Pos | Team | Spring | Delta | 근거 |");
  L.push("|---:|:---|:---:|:---:|:---|:---:|:---|");
  for (const e of risers) {
    L.push(
      `| ${e.player.rank} | **${e.player.name}** | ${posLabel(e)} | ${e.player.team} | ${truncate(springOneLiner(e), 36)} | ${deltaBadge(e.expectationDelta)} | ${keyNote(e)} |`,
    );
  }
  L.push("");

  if (fallers.length > 0) {
    L.push("### 하향 (주의 선수)");
    L.push("");
    L.push("| # | Player | Pos | Team | Spring | Delta | 사유 |");
    L.push("|---:|:---|:---:|:---:|:---|:---:|:---|");
    for (const e of fallers) {
      L.push(
        `| ${e.player.rank} | **${e.player.name}** | ${posLabel(e)} | ${e.player.team} | ${truncate(springOneLiner(e), 36)} | ${deltaBadge(e.expectationDelta)} | ${keyNote(e)} |`,
      );
    }
    L.push("");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROUND DETAILS — grouped by phase
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 라운드별 상세");
  L.push("");

  const phases: Array<{
    label: string;
    range: string;
    rounds: typeof roundPlans;
  }> = [
    {
      label: "Core Build",
      range: "1~3R",
      rounds: roundPlans.filter((p) => p.round <= 3),
    },
    {
      label: "Foundation",
      range: "4~7R",
      rounds: roundPlans.filter((p) => p.round >= 4 && p.round <= 7),
    },
    {
      label: "Depth Fill",
      range: "8~13R",
      rounds: roundPlans.filter((p) => p.round >= 8 && p.round <= 13),
    },
    {
      label: "Upside Bets",
      range: "14~19R",
      rounds: roundPlans.filter((p) => p.round >= 14 && p.round <= 19),
    },
  ];

  for (const phase of phases) {
    L.push(`### ${phase.label} (${phase.range})`);
    L.push("");

    for (const plan of phase.rounds) {
      const candidates = plan.candidates;
      if (candidates.length === 0) {
        L.push(
          `**${plan.round}R** Pick #${plan.pick} — 해당 구간 강한 시그널 선수 없음, BPA로 진행`,
        );
        L.push("");
        continue;
      }

      L.push(`**${plan.round}R** Pick #${plan.pick}`);
      L.push("");
      L.push("| | Player | Pos | Team | Spring | Fit | Health | Note |");
      L.push("|:---:|:---|:---:|:---:|:---|:---:|:---:|:---|");
      for (const entry of candidates) {
        const star =
          plan.board.indexOf(entry) === 0
            ? "⭐"
            : plan.board.includes(entry)
              ? "▸"
              : " ";
        L.push(
          `| ${star} | **${entry.player.name}** | ${posLabel(entry)} | ${entry.player.team} | ${truncate(springOneLiner(entry), 36)} | ${fitBadge(entry.leagueFitScore)} | ${healthBadge(entry.healthRiskScore)} | ${keyNote(entry)} |`,
        );
      }
      L.push("");

      // Top candidate details
      const top = candidates[0];
      if (top) {
        const quality = qualityOneLiner(top);
        const topNotes = top.notes.filter(
          (n) =>
            !n.startsWith("Spring:") &&
            !n.startsWith("Quality:") &&
            !n.includes("깊은 포지션") &&
            !n.includes("희소 포지션"),
        );
        if (quality || topNotes.length > 0) {
          L.push(`> **${top.player.name}** 상세`);
          if (quality) L.push(`> Statcast: ${truncate(quality, 80)}`);
          for (const note of topNotes.slice(0, 3)) {
            L.push(`> ${truncate(note, 90)}`);
          }
          L.push("");
        }
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HEALTH WATCHLIST
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const healthWatch = [...evaluations]
    .filter((e) => e.healthRiskScore >= 30)
    .sort(
      (a, b) =>
        b.healthRiskScore - a.healthRiskScore || a.player.rank - b.player.rank,
    )
    .slice(0, 12);

  if (healthWatch.length > 0) {
    L.push("---");
    L.push("");
    L.push("## 건강 리스크 워치리스트");
    L.push("");
    L.push("이 선수들은 뽑기 전에 최신 뉴스를 반드시 확인하세요.");
    L.push("");
    L.push("| # | Player | Pos | Risk | 사유 |");
    L.push("|---:|:---|:---:|:---:|:---|");
    for (const entry of healthWatch) {
      const icon = entry.healthRiskScore >= 70 ? "🔴" : "🟠";
      L.push(
        `| ${entry.player.rank} | **${entry.player.name}** | ${posLabel(entry)} | ${icon} ${entry.healthRiskScore} | ${truncate(healthReason(entry), 72)} |`,
      );
    }
    L.push("");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POSITION TIERS (compact)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 포지션별 Quick Reference");
  L.push("");
  L.push(
    "내 드래프트 범위(Rank 1~225)에서 뽑을 수 있는 선수를 포지션별로 정리.",
  );
  L.push("");

  const posOrder = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];
  for (const pos of posOrder) {
    const posPlayers = evaluations
      .filter((e) => {
        if (pos === "SP" || pos === "RP")
          return e.player.displayPosition.includes(pos);
        return e.player.displayPosition.split(",")[0].trim() === pos;
      })
      .sort((a, b) => a.player.rank - b.player.rank);

    if (posPlayers.length === 0) continue;

    const tierGroups: Array<{ label: string; players: PlayerEvaluation[] }> =
      [];
    for (let i = 0; i < posPlayers.length; i++) {
      const tierLabel = i < 2 ? "T1" : i < 5 ? "T2" : i < 10 ? "T3" : "T4";
      const existing = tierGroups.find((g) => g.label === tierLabel);
      if (existing) {
        existing.players.push(posPlayers[i]);
      } else {
        tierGroups.push({ label: tierLabel, players: [posPlayers[i]] });
      }
    }

    L.push(`### ${pos} (${posPlayers.length}명)`);
    L.push("");
    for (const tier of tierGroups) {
      const playerStrs = tier.players
        .slice(0, 8)
        .map((e) => {
          const icon = recIcon(e.recommendation);
          const d =
            e.expectationDelta !== 0
              ? ` ${deltaBadge(e.expectationDelta)}`
              : "";
          const h =
            e.healthRiskScore >= 30 ? ` ${healthBadge(e.healthRiskScore)}` : "";
          return `${icon} ${e.player.name} #${e.player.rank}${d}${h}`;
        })
        .join(" · ");
      L.push(`**${tier.label}**: ${playerStrs}`);
    }
    const remaining = posPlayers.length - Math.min(posPlayers.length, 18);
    if (remaining > 0) {
      L.push(`외 ${remaining}명`);
    }
    L.push("");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PICK ORDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 내 픽 순서");
  L.push("");
  L.push("| R | 방향 | 전체 Pick # | Phase |");
  L.push("|:---:|:---:|---:|:---|");
  myPicks.forEach((pick, round) => {
    const dir = round % 2 === 0 ? "→ 정방향" : "← 역방향";
    L.push(`| ${round + 1} | ${dir} | ${pick} | ${phaseLabel(round + 1)} |`);
  });
  L.push("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LEGEND
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L.push("---");
  L.push("");
  L.push("## 범례");
  L.push("");
  L.push("| 기호 | 의미 |");
  L.push("|:---:|:---|");
  L.push("| 🟢 target | 기대치 상향 + 건강 양호 → 적극 노려볼 선수 |");
  L.push("| 🟡 hold | 큰 변동 없음 → Yahoo 랭킹 기준 유지 |");
  L.push(
    "| 🟠 caution | 기대치 하향 또는 중간 건강 리스크 → 한 라운드 늦춰도 OK |",
  );
  L.push("| 🔴 fade | 높은 건강 리스크 → 되도록 패스 |");
  L.push("| ⭐ | 해당 라운드 최우선 추천 |");
  L.push("| **+++** / **++** / + | 기대치 상향 폭 |");
  L.push("| − / **−−** | 기대치 하향 폭 |");
  L.push("| **A+** / **A** / B / C / D | 리그 카테고리 적합도 |");
  L.push("");
  L.push(
    "**Delta 산출**: Spring GL 성적 (K/BB, HR, 출전량) + Statcast Quality (EV, LA, FB Velo) + IL History + 뉴스 신호",
  );
  L.push("");
  L.push(
    "**Fit 산출**: 리그 타자 카테고리(BB/OBP/낮은K, HR/TB/SLG, AVG/H/R, NSB, A) 적합도 + 포지션 희소성 + SP/RP 빌드 밸런스",
  );
  L.push("");

  return L.join("\n");
}

export async function runExpectationReport(
  options: ExpectationOptions,
): Promise<void> {
  const count = options.count ?? 36;
  const myPick = options.myPick ?? 4;
  const numTeams = options.numTeams ?? 12;
  const rounds = options.rounds ?? 5;

  const [board, context] = await Promise.all([
    fetchYahooBoard(options.leagueKey, count),
    fetchLeagueContext(options.leagueKey, numTeams),
  ]);
  const [globalNewsFeed, teamNewsFeed] = await Promise.all([
    fetchMlbNewsFeed(),
    fetchTeamNewsFeeds(board.map((player) => player.team)),
  ]);
  const newsFeed = dedupeRssItems([...globalNewsFeed, ...teamNewsFeed]);

  console.log(`📡 Yahoo OR 상위 ${count}명 로드 완료, MLB 데이터 분석 중...`);

  const baseEvaluations = await mapWithConcurrency(board, 5, (player) =>
    evaluatePlayer(player, newsFeed),
  );
  const evaluations = applyLeagueContext(baseEvaluations, context);
  const myPicks = getMyPicks(myPick, numTeams, rounds);
  const roundPlans = buildRoundPlans(evaluations, myPicks);
  const scarcityMap = computeScarcityMap(evaluations, context);

  // Console output
  printSection("Expectation Report");
  console.log(
    `리그 ${options.leagueKey} | Yahoo OR 상위 ${count}명 | MLB/team RSS + spring game log + metricAverages + 2025 season baseline 기반`,
  );
  console.log(
    "주의: 시범경기는 작은 샘플이라 표면 성적보다 출전량, K/BB, Statcast quality, 역할/건강 기사, 2025 시즌 카테고리 적합도를 더 크게 봤습니다.\n",
  );

  printSection("League Lens");
  for (const note of context.strategyNotes) {
    console.log(`- ${note}`);
  }
  console.log(
    `- 현재 보드 기준 희소 포지션: ${summarizeScarcityMap(scarcityMap)}`,
  );
  console.log(
    `- 최소 IP ${context.minInningsPitched} | SP ${context.rosterSlots.SP ?? 0} / RP ${context.rosterSlots.RP ?? 0} / P ${context.rosterSlots.P ?? 0}\n`,
  );

  const risers = [...evaluations]
    .sort(
      (a, b) =>
        b.expectationDelta - a.expectationDelta ||
        a.player.rank - b.player.rank,
    )
    .filter((entry) => entry.expectationDelta !== 0)
    .slice(0, 8);

  printSection("Final Draft Board");
  printTable(
    ["Round", "Pick", "Priority 1", "Priority 2", "Priority 3"],
    roundPlans.map((plan) => {
      const boardEntries: Array<PlayerEvaluation | null> = [...plan.board];
      while (boardEntries.length < 3) {
        boardEntries.push(null);
      }
      return [
        `${plan.round}R`,
        String(plan.pick),
        boardEntries[0]
          ? truncate(
              `${boardEntries[0].player.name} ${summarizeDelta(boardEntries[0].expectationDelta)}`,
              28,
            )
          : "-",
        boardEntries[1]
          ? truncate(
              `${boardEntries[1].player.name} ${summarizeDelta(boardEntries[1].expectationDelta)}`,
              28,
            )
          : "-",
        boardEntries[2]
          ? truncate(
              `${boardEntries[2].player.name} ${summarizeDelta(boardEntries[2].expectationDelta)}`,
              28,
            )
          : "-",
      ];
    }),
  );

  printSection("Top Adjustments");
  printTable(
    ["Rank", "Player", "Pos", "Delta", "Fit", "Health", "Call"],
    risers.map((entry) => [
      String(entry.player.rank),
      entry.player.name,
      entry.player.displayPosition,
      summarizeDelta(entry.expectationDelta),
      summarizeFitScore(entry.leagueFitScore),
      `${entry.healthLevel} (${entry.healthRiskScore})`,
      entry.recommendation,
    ]),
  );

  for (const plan of roundPlans) {
    const candidates = plan.candidates;

    if (candidates.length === 0) {
      continue;
    }

    printSection(`${plan.round}R Targets (Pick ${plan.pick})`);
    printTable(
      ["Rank", "Player", "Pos", "Delta", "Fit", "Health", "Call"],
      candidates.map((entry) => [
        String(entry.player.rank),
        entry.player.name,
        entry.player.displayPosition,
        summarizeDelta(entry.expectationDelta),
        summarizeFitScore(entry.leagueFitScore),
        `${entry.healthLevel} (${entry.healthRiskScore})`,
        entry.recommendation,
      ]),
    );

    for (const candidate of candidates.slice(0, 3)) {
      console.log(
        `- ${candidate.player.name}: ${candidate.notes
          .slice(0, 4)
          .map((note) => truncate(note, 96))
          .join(" | ")}`,
      );
    }
    console.log("");
  }

  const healthWatch = [...evaluations]
    .filter((entry) => entry.healthRiskScore >= 30)
    .sort(
      (a, b) =>
        b.healthRiskScore - a.healthRiskScore || a.player.rank - b.player.rank,
    )
    .slice(0, 8);

  if (healthWatch.length > 0) {
    printSection("Health Watchlist");
    printTable(
      ["Rank", "Player", "Pos", "Health", "Latest Note"],
      healthWatch.map((entry) => [
        String(entry.player.rank),
        entry.player.name,
        entry.player.displayPosition,
        `${entry.healthLevel} (${entry.healthRiskScore})`,
        truncate(healthReason(entry), 72),
      ]),
    );
  }

  // Markdown export
  const md = generateMarkdown(evaluations, myPicks, context, {
    leagueKey: options.leagueKey,
    count,
    myPick,
    numTeams,
    rounds,
  });

  const outPath = options.markdownPath
    ? isAbsolute(options.markdownPath)
      ? options.markdownPath
      : join(process.cwd(), options.markdownPath)
    : join(process.cwd(), "data", "expectations-2026.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, "utf-8");
  console.log(`\n📄 리포트 저장: ${outPath}`);
}
