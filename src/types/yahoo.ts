export interface YahooToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number; // unix timestamp
}

export interface YahooLeague {
  league_key: string;
  league_id: string;
  name: string;
  season: string;
  num_teams: number;
  scoring_type: string;
  draft_status: string;
}

export interface YahooTeam {
  team_key: string;
  team_id: string;
  name: string;
  manager: { nickname: string };
  standings?: {
    rank: number;
    wins: number;
    losses: number;
    ties: number;
    percentage: string;
  };
}

export interface YahooPlayer {
  player_key: string;
  player_id: string;
  name: { full: string; first: string; last: string };
  editorial_team_abbr: string;
  display_position: string;
  position_type: string; // B or P
  status?: string;
  eligible_positions: string[];
}

export interface YahooDraftPick {
  pick: number;
  round: number;
  team_key: string;
  player_key: string;
  cost?: number; // auction
}

export interface YahooStandings {
  teams: YahooTeam[];
}
