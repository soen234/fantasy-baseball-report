import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { YahooToken } from "../types/yahoo.js";
import { saveToken } from "./token.js";

const YAHOO_AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

function getConfig() {
  return {
    clientId: process.env.YAHOO_CLIENT_ID!,
    clientSecret: process.env.YAHOO_CLIENT_SECRET!,
    redirectUri: process.env.YAHOO_REDIRECT_URI!,
  };
}

/** 자체 서명 인증서 생성 (없으면) */
function ensureCerts(): { key: string; cert: string } {
  const certsDir = path.join(process.cwd(), "data", "certs");
  const keyPath = path.join(certsDir, "key.pem");
  const certPath = path.join(certsDir, "cert.pem");

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    fs.mkdirSync(certsDir, { recursive: true });
    console.log("🔐 자체 서명 인증서 생성 중...");
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "365",
      "-nodes",
      "-subj",
      "/CN=localhost",
    ]);
  }

  return {
    key: fs.readFileSync(keyPath, "utf-8"),
    cert: fs.readFileSync(certPath, "utf-8"),
  };
}

/** 인증 코드를 토큰으로 교환 */
async function exchangeCodeForToken(code: string): Promise<YahooToken> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`토큰 교환 실패: ${res.status} ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

/** 리프레시 토큰으로 새 액세스 토큰 발급 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<YahooToken> {
  const { clientId, clientSecret } = getConfig();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`토큰 갱신 실패: ${res.status} ${err}`);
  }

  const data = await res.json();
  const token: YahooToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };

  saveToken(token);
  return token;
}

/** 브라우저로 Yahoo 로그인 → 콜백 수신 → 토큰 저장 */
export function startOAuthFlow(): Promise<YahooToken> {
  return new Promise((resolve, reject) => {
    const { clientId, redirectUri } = getConfig();
    const { key, cert } = ensureCerts();

    const server = https.createServer({ key, cert }, async (req, res) => {
      const url = new URL(req.url!, `https://localhost:4000`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error || !code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>인증 실패</h1><p>브라우저를 닫아주세요.</p>");
          server.close();
          reject(new Error(`OAuth 에러: ${error}`));
          return;
        }

        try {
          const token = await exchangeCodeForToken(code);
          saveToken(token);

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<h1>✅ 인증 완료!</h1><p>이 창을 닫고 터미널로 돌아가세요.</p>",
          );
          server.close();
          resolve(token);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>토큰 교환 실패</h1>");
          server.close();
          reject(err);
        }
      }
    });

    server.listen(4000, () => {
      const authUrl = `${YAHOO_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&language=en-us`;

      console.log("\n📎 브라우저에서 아래 URL을 열어 Yahoo에 로그인하세요:");
      console.log(`\n  ${authUrl}\n`);

      // 자동으로 브라우저 열기 시도
      import("open")
        .then((open) => open.default(authUrl))
        .catch(() => {
          /* 수동으로 열도록 URL 이미 출력됨 */
        });
    });

    server.on("error", reject);
  });
}
