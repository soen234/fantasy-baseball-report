import "dotenv/config";
import { runExpectationReport } from "../strategy/expectation.js";

const leagueKey = process.argv[2] ?? "469.l.18247";
const countArg = process.argv[3];
const count = countArg ? Number(countArg) : undefined;

const roundsArg = process.argv[4];

await runExpectationReport({
  leagueKey,
  count,
  myPick: 4,
  numTeams: 12,
  rounds: roundsArg ? Number(roundsArg) : 19,
  markdownPath: "data/draft-final-2026.md",
});
