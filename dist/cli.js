#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { startOAuthFlow } from "./auth/oauth.js";
import { loadToken } from "./auth/token.js";
import { runExpectationReport } from "./strategy/expectation.js";
import { getMyLeagues, getStandings, getDraftResults, getRoster, getScoreboard, searchPlayers, getTransactions, getFreeAgents, yahooApi, } from "./api/yahoo.js";
import { printSection } from "./reports/format.js";
const program = new Command();
program.name("fb").description("Yahoo Fantasy Baseball CLI").version("1.0.0");
// ─── auth ────────────────────────────────────
program
    .command("auth")
    .description("Yahoo OAuth 로그인")
    .action(async () => {
    try {
        const token = await startOAuthFlow();
        console.log("✅ 인증 완료! 토큰이 data/token.json에 저장되었습니다.");
    }
    catch (err) {
        console.error("❌ 인증 실패:", err.message);
        process.exit(1);
    }
});
// ─── leagues ─────────────────────────────────
program
    .command("leagues")
    .description("내 리그 목록")
    .option("-s, --season <year>", "시즌 연도")
    .action(async (opts) => {
    try {
        const data = await getMyLeagues(opts.season);
        printSection("내 Fantasy Baseball 리그");
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── standings ───────────────────────────────
program
    .command("standings <leagueKey>")
    .description("리그 순위")
    .action(async (leagueKey) => {
    try {
        const data = await getStandings(leagueKey);
        printSection(`리그 순위: ${leagueKey}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── draft ───────────────────────────────────
program
    .command("draft <leagueKey>")
    .description("드래프트 결과")
    .action(async (leagueKey) => {
    try {
        const data = await getDraftResults(leagueKey);
        printSection(`드래프트 결과: ${leagueKey}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── roster ──────────────────────────────────
program
    .command("roster <teamKey>")
    .description("팀 로스터")
    .action(async (teamKey) => {
    try {
        const data = await getRoster(teamKey);
        printSection(`로스터: ${teamKey}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── scoreboard ──────────────────────────────
program
    .command("scoreboard <leagueKey>")
    .description("리그 스코어보드")
    .option("-w, --week <number>", "주차", parseInt)
    .action(async (leagueKey, opts) => {
    try {
        const data = await getScoreboard(leagueKey, opts.week);
        printSection(`스코어보드: ${leagueKey}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── players ─────────────────────────────────
program
    .command("players <leagueKey> <search>")
    .description("선수 검색")
    .action(async (leagueKey, search) => {
    try {
        const data = await searchPlayers(leagueKey, search);
        printSection(`선수 검색: ${search}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── transactions ────────────────────────────
program
    .command("transactions <leagueKey>")
    .description("리그 트랜잭션 (트레이드, 웨이버 등)")
    .action(async (leagueKey) => {
    try {
        const data = await getTransactions(leagueKey);
        printSection(`트랜잭션: ${leagueKey}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── fa ──────────────────────────────────────
program
    .command("fa <leagueKey>")
    .description("FA (Free Agent) 목록")
    .option("-p, --position <pos>", "포지션 필터 (C, 1B, SP, RP 등)")
    .action(async (leagueKey, opts) => {
    try {
        const data = await getFreeAgents(leagueKey, opts.position);
        printSection(`Free Agents: ${leagueKey}`);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── raw ─────────────────────────────────────
program
    .command("raw <path>")
    .description("Yahoo Fantasy API 직접 호출 (디버깅용)")
    .action(async (apiPath) => {
    try {
        const data = await yahooApi(apiPath);
        console.log(JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
// ─── status ──────────────────────────────────
program
    .command("status")
    .description("인증 상태 확인")
    .action(() => {
    const token = loadToken();
    if (!token) {
        console.log("❌ 인증되지 않음. `fb auth`를 실행하세요.");
        return;
    }
    const expiresAt = new Date(token.expires_at * 1000);
    const isExpired = Date.now() > token.expires_at * 1000;
    console.log(`✅ 인증됨`);
    console.log(`   만료: ${expiresAt.toLocaleString()} ${isExpired ? "(만료됨 - 자동 갱신됨)" : "(유효)"}`);
});
// ─── expectations ───────────────────────────
program
    .command("expectations <leagueKey>")
    .description("드래프트 expectation 리포트 (Yahoo + MLB/team RSS + spring + Statcast + health risk)")
    .option("-c, --count <number>", "분석할 상위 Yahoo OR 인원", parseInt)
    .option("-p, --pick <number>", "내 드래프트 순번", parseInt)
    .option("-t, --teams <number>", "리그 팀 수", parseInt)
    .option("-r, --rounds <number>", "집중 분석 라운드 수", parseInt)
    .option("-m, --markdown <path>", "markdown 리포트 저장 경로")
    .action(async (leagueKey, opts) => {
    try {
        await runExpectationReport({
            leagueKey,
            count: opts.count,
            myPick: opts.pick,
            numTeams: opts.teams,
            rounds: opts.rounds,
            markdownPath: opts.markdown,
        });
    }
    catch (err) {
        console.error("❌", err.message);
    }
});
program.parse();
