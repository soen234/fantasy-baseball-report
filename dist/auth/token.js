import fs from "node:fs";
import path from "node:path";
const TOKEN_PATH = path.join(process.cwd(), "data", "token.json");
export function saveToken(token) {
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}
export function loadToken() {
    if (!fs.existsSync(TOKEN_PATH))
        return null;
    const raw = fs.readFileSync(TOKEN_PATH, "utf-8");
    return JSON.parse(raw);
}
export function isTokenExpired(token) {
    // 5분 여유를 두고 만료 체크
    return Date.now() > (token.expires_at - 300) * 1000;
}
