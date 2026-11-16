// POST /api/admin/login {password} -> nastaví podepsanou cookii přihlášení na 30 dní.
const admin = require("../_lib/admin.js");

module.exports = async (req, res) => {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		return admin.sendJson(res, 405, { error: "method_not_allowed" });
	}
	const cfg = admin.config();
	if (!cfg.authReady) return admin.sendJson(res, 503, { error: "not_configured" });
	let body = {};
	try {
		body = await admin.readBody(req);
	} catch (e) {
		return admin.sendJson(res, 400, { error: "bad_request" });
	}
	const ok = admin.passwordMatches(cfg, body.password);
	// Stejná pauza pro správné i špatné heslo: z rychlosti odpovědi nejde poznat výsledek dřív.
	// Proti hrubé síle chrání hlavně náhodné heslo (aspoň 20 znaků), případně limit ve Vercel Firewall.
	await new Promise((resolve) => setTimeout(resolve, 600));
	if (!ok) return admin.sendJson(res, 401, { error: "wrong_password" });
	res.setHeader("Set-Cookie", admin.sessionCookie(admin.makeToken(cfg), admin.SESSION_DAYS * 86400));
	return admin.sendJson(res, 200, { ok: true });
};
