import "dotenv/config";
import { runExpectationReport } from "../strategy/expectation.js";
const leagueKey = process.argv[2] ?? "469.l.18247";
const countArg = process.argv[3];
const count = countArg ? Number(countArg) : undefined;
await runExpectationReport({
    leagueKey,
    count,
    myPick: 4,
    numTeams: 12,
    rounds: 5,
});
