import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { yahooApi } from "../api/yahoo.js";
const LEAGUE_KEY = "469.l.18247";
const MY_PICK = 4;
const NUM_TEAMS = 12;
const TOTAL_ROUNDS = 19;
function extractPlayers(data, startRank) {
    const players = [];
    const playersObj = data.fantasy_content.league[1].players;
    for (let i = 0; i < playersObj.count; i++) {
        const arr = playersObj[i].player[0];
        players.push({
            rank: startRank + i + 1,
            name: arr.find((p) => p.name)?.name?.full ?? "?",
            team: arr.find((p) => p.editorial_team_abbr)?.editorial_team_abbr ?? "?",
            position: arr.find((p) => p.display_position)?.display_position ?? "?",
            positionType: arr.find((p) => p.position_type)?.position_type ?? "?",
            eligiblePositions: (arr.find((p) => p.eligible_positions)?.eligible_positions ?? [])
                .filter((ep) => ep.position)
                .map((ep) => ep.position),
        });
    }
    return players;
}
function getMyPicks(pick, teams, rounds) {
    const picks = [];
    for (let r = 0; r < rounds; r++) {
        picks.push(r % 2 === 0 ? r * teams + pick : r * teams + (teams - pick + 1));
    }
    return picks;
}
async function main() {
    console.log("데이터 로딩 중...");
    // 19R × 12팀 = 228픽 → 여유있게 350명 로드
    const batches = await Promise.all([0, 50, 100, 150, 200, 250, 300].map((s) => yahooApi(`/league/${LEAGUE_KEY}/players;sort=OR;start=${s};count=50`)));
    const allPlayers = [];
    batches.forEach((b, i) => allPlayers.push(...extractPlayers(b, i * 50)));
    const myPicks = getMyPicks(MY_PICK, NUM_TEAMS, TOTAL_ROUNDS);
    // 포지션별 그룹
    const byPos = {};
    for (const p of allPlayers) {
        for (const ep of p.eligiblePositions) {
            if (!byPos[ep])
                byPos[ep] = [];
            byPos[ep].push(p);
        }
    }
    // 로스터 슬롯
    const rosterSlots = [
        "C",
        "1B",
        "2B",
        "3B",
        "SS",
        "OF",
        "OF",
        "OF",
        "Util",
        "SP",
        "SP",
        "SP",
        "SP",
        "RP",
        "RP",
        "RP",
        "RP",
        "P",
        "BN",
    ];
    // ── MD 생성 ──
    const lines = [];
    const w = (s) => lines.push(s);
    w("# 2026 Fantasy Baseball Draft Plan");
    w("");
    w(`> **리그**: 리그 네이밍 후원 환영합니다 (${LEAGUE_KEY})`);
    w(`> **드래프트**: 3/20(금) 밤 10시 | 스네이크 | 12팀 | **4픽**`);
    w(`> **로스터**: C, 1B, 2B, 3B, SS, OF×3, Util, SP×4, RP×4, P, BN×2, IL×2`);
    w("");
    w("---");
    w("");
    // 평가 기준
    w("## 리그 평가 기준");
    w("");
    w("### 타자 카테고리");
    w("| 카테고리 | 방향 |");
    w("|----------|------|");
    w("| R (득점) | 높을수록 좋음 |");
    w("| H (안타) | 높을수록 좋음 |");
    w("| HR (홈런) | 높을수록 좋음 |");
    w("| RBI (타점) | 높을수록 좋음 |");
    w("| BB (볼넷) | 높을수록 좋음 |");
    w("| K (삼진) | 낮을수록 좋음 |");
    w("| TB (루타) | 높을수록 좋음 |");
    w("| A (어시스트) | 높을수록 좋음 |");
    w("| AVG (타율) | 높을수록 좋음 |");
    w("| OBP (출루율) | 높을수록 좋음 |");
    w("| SLG (장타율) | 높을수록 좋음 |");
    w("| NSB (순도루) | 높을수록 좋음 |");
    w("| SLAM (만루홈런) | 높을수록 좋음 |");
    w("");
    w("### 투수 카테고리");
    w("| 카테고리 | 방향 |");
    w("|----------|------|");
    w("| W (승) | 높을수록 좋음 |");
    w("| L (패) | 낮을수록 좋음 |");
    w("| CG (완투) | 높을수록 좋음 |");
    w("| K (탈삼진) | 높을수록 좋음 |");
    w("| GIDP (병살 유도) | 높을수록 좋음 |");
    w("| TB (피루타) | 낮을수록 좋음 |");
    w("| ERA (평균자책) | 낮을수록 좋음 |");
    w("| WHIP | 낮을수록 좋음 |");
    w("| K/BB (탈삼진/볼넷) | 높을수록 좋음 |");
    w("| RAPP (구원등판) | 높을수록 좋음 |");
    w("| QS (퀄리티스타트) | 높을수록 좋음 |");
    w("| NSVH (순세이브+홀드) | 높을수록 좋음 |");
    w("");
    w("---");
    w("");
    // 포지션 희소성
    w("## 포지션 희소성 (Top 250)");
    w("");
    const scarcityOrder = ["C", "3B", "2B", "1B", "SS", "RP", "OF", "SP"];
    w("| 포지션 | 인원 | 희소성 |");
    w("|--------|------|--------|");
    for (const pos of scarcityOrder) {
        const mainPosPlayers = allPlayers.filter((p) => p.position.split(",")[0].trim() === pos);
        const count = mainPosPlayers.length;
        const label = count <= 5 ? "🔴 매우 희소" : count <= 10 ? "🟡 보통" : "🟢 풍부";
        w(`| ${pos} | ${count}명 | ${label} |`);
    }
    w("");
    w("---");
    w("");
    // 내 픽 순서
    w("## 내 픽 순서");
    w("");
    w("| 라운드 | 방향 | 전체 픽 번호 |");
    w("|--------|------|-------------|");
    myPicks.forEach((pick, round) => {
        const dir = round % 2 === 0 ? "→ 정방향" : "← 역방향";
        w(`| ${round + 1}R | ${dir} | ${pick}번째 |`);
    });
    w("");
    w("---");
    w("");
    // ── 라운드별 추천 ──
    w("## 라운드별 추천 픽");
    w("");
    // 남은 포지션 니즈 추적
    const needs = {
        C: 1,
        "1B": 1,
        "2B": 1,
        "3B": 1,
        SS: 1,
        OF: 3,
        Util: 1,
        SP: 4,
        RP: 4,
        P: 1,
        BN: 2,
    };
    // 다른 팀이 순위대로 뽑는다고 가정 → 남은 선수 풀 관리
    const globalDrafted = new Set(); // 다른 팀이 뽑은 선수 rank
    const myDrafted = new Set(); // 내가 뽑은 선수 rank
    // 전체 드래프트를 시뮬레이션
    let nextAvailIdx = 0; // allPlayers에서 다음으로 뽑힐 인덱스
    for (let overallPick = 1; overallPick <= TOTAL_ROUNDS * NUM_TEAMS; overallPick++) {
        const myRound = myPicks.indexOf(overallPick);
        if (myRound === -1) {
            // 다른 팀 픽 → 최상위 남은 선수를 뽑음
            while (nextAvailIdx < allPlayers.length &&
                (globalDrafted.has(allPlayers[nextAvailIdx].rank) ||
                    myDrafted.has(allPlayers[nextAvailIdx].rank))) {
                nextAvailIdx++;
            }
            if (nextAvailIdx < allPlayers.length) {
                globalDrafted.add(allPlayers[nextAvailIdx].rank);
                nextAvailIdx++;
            }
        }
        // 내 픽은 건너뜀 (아래에서 추천)
    }
    // 이제 내 각 픽 시점의 가용 선수를 정확히 계산
    // 다시 시뮬레이션하면서 내 픽 시점마다 추천 생성
    const globalDrafted2 = new Set();
    const myDrafted2 = new Set();
    let nextIdx = 0;
    /** 선수가 채울 수 있는 니즈 포지션 반환 */
    function getMatchingNeed(p, currentNeeds) {
        // 정확한 포지션 매칭 우선
        for (const ep of p.eligiblePositions) {
            if (ep !== "Util" && currentNeeds[ep] && currentNeeds[ep] > 0)
                return ep;
        }
        // Util 슬롯
        if (p.positionType === "B" && currentNeeds["Util"] > 0)
            return "Util";
        // P 슬롯 (SP/RP 둘 다 가능)
        if (p.positionType === "P" && currentNeeds["P"] > 0)
            return "P";
        // BN
        if (currentNeeds["BN"] > 0)
            return "BN";
        return null;
    }
    /** 포지션 희소성 점수 (낮을수록 희소) */
    function scarcityScore(p, available) {
        const mainPos = p.position.split(",")[0].trim();
        return available.filter((a) => a.position.split(",")[0].trim() === mainPos)
            .length;
    }
    /** 현재 니즈에서 가장 급한 포지션 목록 (필요량 대비 공급 비율) */
    function getUrgentPositions(currentNeeds, available) {
        const urgent = []; // [pos, supply, urgencyScore]
        const positionsToCheck = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];
        for (const pos of positionsToCheck) {
            const need = currentNeeds[pos] ?? 0;
            if (need <= 0)
                continue;
            const supply = available.filter((p) => p.eligiblePositions.includes(pos) ||
                p.position.split(",")[0].trim() === pos).length;
            // 긴급도 = 필요 슬롯 수 / 남은 공급 (높을수록 급함)
            const urgency = supply > 0 ? need / supply : 999;
            urgent.push([pos, supply, urgency]);
        }
        urgent.sort((a, b) => b[2] - a[2]); // 긴급도 높은 순
        return urgent.map(([pos]) => pos);
    }
    for (let overallPick = 1; overallPick <= TOTAL_ROUNDS * NUM_TEAMS; overallPick++) {
        const myRound = myPicks.indexOf(overallPick);
        if (myRound === -1) {
            // 다른 팀 픽
            while (nextIdx < allPlayers.length &&
                (globalDrafted2.has(allPlayers[nextIdx].rank) ||
                    myDrafted2.has(allPlayers[nextIdx].rank))) {
                nextIdx++;
            }
            if (nextIdx < allPlayers.length) {
                globalDrafted2.add(allPlayers[nextIdx].rank);
                nextIdx++;
            }
            continue;
        }
        // === 내 픽 ===
        const pickNum = overallPick;
        const available = allPlayers.filter((p) => !globalDrafted2.has(p.rank) && !myDrafted2.has(p.rank));
        // 남은 니즈 문자열
        const needsList = Object.entries(needs)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}×${v}`)
            .join(", ");
        // 급한 포지션 파악
        const urgentPos = getUrgentPositions(needs, available);
        // 전략 결정 (니즈 기반)
        let strategy = "";
        const topUrgent = urgentPos.slice(0, 2);
        if (myRound <= 1) {
            strategy = "엘리트 선수 확보 — 가장 높은 가치의 선수 우선";
        }
        else if (topUrgent.length > 0) {
            const urgentLabels = topUrgent.map((pos) => {
                const supply = available.filter((p) => p.eligiblePositions.includes(pos) ||
                    p.position.split(",")[0].trim() === pos).length;
                return `**${pos}**(남은 후보 ${supply}명)`;
            });
            strategy = `희소 포지션 우선 — ${urgentLabels.join(", ")} 확보 필요`;
        }
        else {
            strategy = "벤치/가치 픽 — 업사이드 있는 선수";
        }
        // 추천 선수 선정: 라운드에 따라 가치 vs 니즈 비중 조절
        const candidates = available.slice(0, 80);
        const valueWeight = Math.max(10, 100 - myRound * 12); // 1R:100, 후반:10
        const needWeight = Math.min(100, 20 + myRound * 12); // 1R:20, 후반:100
        const scored = candidates.map((p) => {
            let score = 0;
            const matchedNeed = getMatchingNeed(p, needs);
            // 가치 점수 (순위가 높을수록)
            const rankIdx = available.indexOf(p);
            score += Math.max(0, 80 - rankIdx) * (valueWeight / 100);
            // 니즈 매칭 점수
            if (matchedNeed && matchedNeed !== "BN" && matchedNeed !== "Util") {
                score += 50 * (needWeight / 100);
            }
            else if (matchedNeed === "Util" || matchedNeed === "P") {
                score += 20 * (needWeight / 100);
            }
            else if (matchedNeed === "BN") {
                score += 5 * (needWeight / 100);
            }
            else {
                // 니즈에 안 맞으면 페널티
                score -= 30 * (needWeight / 100);
            }
            // 희소성 보너스 (급한 포지션일수록)
            const mainPos = p.position.split(",")[0].trim();
            const urgIdx = urgentPos.indexOf(mainPos);
            if (urgIdx !== -1 && urgIdx < 3) {
                score += (3 - urgIdx) * 15 * (needWeight / 100);
            }
            // 대량 니즈 보너스 (SP×4, OF×3 같이 많이 필요한 포지션)
            for (const ep of p.eligiblePositions) {
                if (needs[ep] && needs[ep] >= 3) {
                    score += 10 * (needWeight / 100);
                }
            }
            // 라운드별 포지션 타이밍 조절
            // - 희소 1슬롯 포지션(C, 3B)은 초반에 잡아야 함 (질적 낭떠러지 큼)
            // - RP는 후반에 잡아도 대체재 많음
            // - SP는 4~6R에 시작
            if (myRound <= 4) {
                if (mainPos === "RP")
                    score -= 50; // 초반 RP 페널티
                if (p.positionType === "B")
                    score += 15; // 초반 타자 보너스
            }
            else if (myRound <= 6) {
                if (mainPos === "SP")
                    score += 10;
            }
            // 희소 1슬롯 포지션 부스트 (R1은 순수 BPA, R2~4에서 강함)
            if (myRound >= 1) {
                const scarceBoost = needWeight / 100;
                if (needs["3B"] > 0 && p.eligiblePositions.includes("3B")) {
                    if (myRound <= 4)
                        score += 50 * scarceBoost;
                    else if (myRound <= 7)
                        score += 25 * scarceBoost;
                }
                if (needs["C"] > 0 && p.eligiblePositions.includes("C")) {
                    if (myRound <= 4)
                        score += 45 * scarceBoost;
                    else if (myRound <= 7)
                        score += 20 * scarceBoost;
                }
            }
            return { player: p, score, matchedNeed };
        });
        scored.sort((a, b) => b.score - a.score);
        const recommended = scored.slice(0, 5);
        w(`### ${myRound + 1}R — 전체 ${pickNum}번째 픽`);
        w("");
        w(`> 전략: ${strategy}`);
        w(`>`);
        w(`> 남은 니즈: ${needsList}`);
        w("");
        if (recommended.length > 0) {
            w("| 추천 | 순위 | 이름 | 팀 | 포지션 | 채울 슬롯 | 비고 |");
            w("|------|------|------|-----|--------|----------|------|");
            recommended.forEach(({ player: p, matchedNeed }, idx) => {
                const star = idx === 0 ? "⭐" : `${idx + 1}`;
                const slot = matchedNeed ?? "-";
                let note = "";
                const mainPos = p.position.split(",")[0].trim();
                if (urgentPos.indexOf(mainPos) < 3 && urgentPos.indexOf(mainPos) >= 0) {
                    note = "희소 포지션";
                }
                if (p.positionType === "P") {
                    note = mainPos === "RP" ? "클로저/셋업" : "에이스급";
                }
                w(`| ${star} | ${p.rank}위 | **${p.name}** | ${p.team} | ${p.position} | ${slot} | ${note} |`);
            });
        }
        else {
            w("_가용 선수 없음_");
        }
        w("");
        // 1순위 추천 선수를 내가 뽑았다고 가정 (시뮬레이션 진행용)
        if (recommended.length > 0) {
            const picked = recommended[0];
            myDrafted2.add(picked.player.rank);
            if (picked.matchedNeed && needs[picked.matchedNeed] > 0) {
                needs[picked.matchedNeed]--;
            }
        }
    }
    w("---");
    w("");
    // 핵심 원칙
    w("## 드래프트 핵심 원칙");
    w("");
    w("1. **3B는 반드시 3R까지 확보** — 전체 4명뿐 (Ramírez, Caminero, Riley, Suárez)");
    w("2. **C는 2R에서 Cal Raleigh 노리기** — 2번째 C(Contreras)까지 큰 갭");
    w("3. **OF는 서두르지 말 것** — Top 150에 18명, 후반에도 좋은 옵션");
    w("4. **SP는 4~6R에 집중** — Skubal/Skenes/Crochet 이후에도 Kirby, Peralta 등 있음");
    w("5. **RP는 후반** — Mason Miller 제외하면 6R 이후에 잡아도 무방");
    w("6. **타자 K(삼진)은 낮을수록 좋음** — 컨택 능력 좋은 타자에 가산점");
    w("7. **A(어시스트) 카테고리** — 내야수(SS, 2B, 3B)가 유리, OF보다 내야 선호");
    w("");
    w("---");
    w("");
    // 포지션별 티어
    w("## 포지션별 선수 티어");
    w("");
    const tierPositions = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];
    for (const pos of tierPositions) {
        const posPlayers = allPlayers.filter((p) => p.position.split(",")[0].trim() === pos);
        if (posPlayers.length === 0)
            continue;
        w(`### ${pos}`);
        w("");
        w("| 티어 | 순위 | 이름 | 팀 |");
        w("|------|------|------|-----|");
        posPlayers.forEach((p, idx) => {
            let tier = "";
            if (idx < 2)
                tier = "🥇 엘리트";
            else if (idx < 5)
                tier = "🥈 상위";
            else if (idx < 10)
                tier = "🥉 중위";
            else
                tier = "보통";
            w(`| ${tier} | ${p.rank}위 | ${p.name} | ${p.team} |`);
        });
        w("");
    }
    // 파일 저장
    const outPath = path.join(process.cwd(), "data", "draft-plan-2026.md");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, lines.join("\n"));
    console.log(`\n✅ 드래프트 플랜 저장: ${outPath}`);
}
main().catch(console.error);
