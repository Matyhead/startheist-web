// Společný základ administrace (/admin). Soubor začíná podtržítkem, takže z něj Vercel nedělá endpoint.
//
// Obsah administrace (dokumenty, plán, balíčky assetů) leží v SOUKROMÉM repu hry, ne tady:
// repo webu je veřejné. Funkce ho čtou přes GitHub API tokenem z proměnných prostředí Vercelu.
//
// Proměnné prostředí (Vercel > Project > Settings > Environment Variables, prostředí Production):
//   ADMIN_PASSWORD  heslo do administrace, aspoň 20 znaků, vygenerované (openssl rand -base64 24) a uložené ve správci hesel
//   ADMIN_SECRET    náhodný klíč pro podpis přihlášení, aspoň 32 znaků (openssl rand -hex 32)
//   GITHUB_TOKEN    fine-grained token jen pro čtení repa hry (Contents: Read-only, Metadata: Read-only)
//   GITHUB_REPO     volitelné, výchozí Matyhead/hush-heist
//   GITHUB_BRANCH   volitelné, výchozí main
// Změna ADMIN_PASSWORD nebo ADMIN_SECRET odhlásí všechna zařízení.

const crypto = require("crypto");

const COOKIE = "hh_admin";
const SESSION_DAYS = 30;
const API = "https://api.github.com";

function config() {
	const password = process.env.ADMIN_PASSWORD || "";
	const secret = process.env.ADMIN_SECRET || "";
	return {
		password,
		secret,
		token: process.env.GITHUB_TOKEN || "",
		repo: process.env.GITHUB_REPO || "Matyhead/hush-heist",
		branch: process.env.GITHUB_BRANCH || "main",
		// Náhodné dlouhé heslo je hlavní ochrana: funkce nemá stav, takže pokusy o heslo počet neomezuje.
		authReady: password.length >= 20 && secret.length >= 32,
	};
}

function hmac(key, data) {
	return crypto.createHmac("sha256", key).update(data).digest();
}

function b64url(buffer) {
	return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Klíč podpisu závisí na heslu i tajemství: změna kteréhokoli zneplatní všechna přihlášení.
function signingKey(cfg) {
	return hmac(cfg.secret, "hh-admin-session:" + cfg.password);
}

function safeEqual(a, b) {
	const x = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
	const y = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
	if (x.length !== y.length) return false;
	return crypto.timingSafeEqual(x, y);
}

function passwordMatches(cfg, input) {
	if (typeof input !== "string" || input.length === 0 || input.length > 512) return false;
	// Porovnávají se otisky stejné délky, ať délka hesla nic neprozradí.
	return safeEqual(hmac(cfg.secret, "pw:" + input), hmac(cfg.secret, "pw:" + cfg.password));
}

function makeToken(cfg) {
	const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
	const body = "v1." + exp;
	return body + "." + b64url(hmac(signingKey(cfg), body));
}

function tokenValid(cfg, token) {
	if (!cfg.authReady || typeof token !== "string") return false;
	const parts = token.split(".");
	if (parts.length !== 3 || parts[0] !== "v1" || !/^\d{1,12}$/.test(parts[1])) return false;
	if (Number(parts[1]) < Math.floor(Date.now() / 1000)) return false;
	const expected = b64url(hmac(signingKey(cfg), parts[0] + "." + parts[1]));
	return safeEqual(expected, parts[2]);
}

function readCookie(req, name) {
	const header = (req.headers && req.headers.cookie) || "";
	for (const piece of header.split(";")) {
		const at = piece.indexOf("=");
		if (at < 0) continue;
		if (piece.slice(0, at).trim() === name) {
			try {
				return decodeURIComponent(piece.slice(at + 1).trim());
			} catch (e) {
				return "";
			}
		}
	}
	return "";
}

function sessionCookie(token, maxAge) {
	return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function isAuthed(req, cfg) {
	return tokenValid(cfg, readCookie(req, COOKIE));
}

function noStore(res) {
	res.setHeader("Cache-Control", "private, no-store, max-age=0");
	res.setHeader("X-Robots-Tag", "noindex, nofollow");
	res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, status, data) {
	noStore(res);
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(JSON.stringify(data));
}

function query(req) {
	if (req.query && typeof req.query === "object") return req.query;
	const url = new URL(req.url || "/", "http://localhost");
	return Object.fromEntries(url.searchParams.entries());
}

function param(req, name) {
	const value = query(req)[name];
	return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

async function readBody(req) {
	if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
	let raw = "";
	if (typeof req.body === "string") raw = req.body;
	else if (Buffer.isBuffer(req.body)) raw = req.body.toString("utf8");
	else {
		raw = await new Promise((resolve, reject) => {
			let data = "";
			req.on("data", (chunk) => {
				data += chunk;
				if (data.length > 10000) reject(new Error("body too large"));
			});
			req.on("end", () => resolve(data));
			req.on("error", reject);
		});
	}
	try {
		return JSON.parse(raw || "{}");
	} catch (e) {
		return {};
	}
}

// Brána každého endpointu s obsahem: přihlášení a token pro GitHub. Vrací config, nebo null (odpověď už odešla).
function guard(req, res, methods) {
	const cfg = config();
	if (methods && !methods.includes(req.method)) {
		res.setHeader("Allow", methods.join(", "));
		sendJson(res, 405, { error: "method_not_allowed" });
		return null;
	}
	if (!cfg.authReady) {
		sendJson(res, 503, { error: "not_configured" });
		return null;
	}
	if (!isAuthed(req, cfg)) {
		sendJson(res, 401, { error: "unauthorized" });
		return null;
	}
	if (!cfg.token) {
		sendJson(res, 503, { error: "github_not_configured" });
		return null;
	}
	return cfg;
}

function github(cfg, path, options) {
	const opts = options || {};
	return fetch(API + path, {
		redirect: opts.redirect || "follow",
		headers: {
			Authorization: "Bearer " + cfg.token,
			Accept: opts.accept || "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "startheist-admin",
		},
	});
}

async function githubJson(cfg, path) {
	const response = await github(cfg, path);
	if (!response.ok) {
		const error = new Error("github " + response.status);
		error.status = response.status;
		throw error;
	}
	return response.json();
}

function repoPath(cfg) {
	const [owner, name] = cfg.repo.split("/");
	return "/repos/" + encodeURIComponent(owner || "") + "/" + encodeURIComponent(name || "");
}

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

// Co administrace smí z repa hry číst: dokumenty ve složce docs a CLAUDE.md. Nic jiného (kód, klíče).
const DOC_RE = /^(docs\/[A-Za-z0-9._\-\/]+\.md|CLAUDE\.md)$/;
const FILE_RE = /^(docs\/[A-Za-z0-9._\-\/]+\.(md|json|png|jpe?g|gif|webp)|CLAUDE\.md)$/i;

function cleanPath(path, re) {
	if (typeof path !== "string" || path.length > 300) return "";
	if (path.includes("..") || path.includes("//") || path.startsWith("/")) return "";
	if (path.split("/").some((part) => part.startsWith("."))) return "";
	return re.test(path) ? path : "";
}

function githubError(res, error) {
	const status = error && error.status === 404 ? 404 : 502;
	sendJson(res, status, { error: status === 404 ? "not_found" : "github_error", status: (error && error.status) || 0 });
}

module.exports = {
	COOKIE,
	SESSION_DAYS,
	config,
	passwordMatches,
	makeToken,
	sessionCookie,
	isAuthed,
	sendJson,
	noStore,
	param,
	readBody,
	guard,
	github,
	githubJson,
	repoPath,
	encodePath,
	DOC_RE,
	FILE_RE,
	cleanPath,
	githubError,
};
