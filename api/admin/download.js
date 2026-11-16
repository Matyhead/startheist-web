// GET /api/admin/download?id=<číslo souboru z /api/admin/assets> -> přesměruje na krátkodobý podepsaný odkaz GitHubu.
// Soubor neteče přes funkci (videa mají stovky MB), prohlížeč ho stáhne přímo z GitHubu.
const admin = require("../_lib/admin.js");

module.exports = async (req, res) => {
	// Kliknutí na Stáhnout po vypršení přihlášení: zpátky do administrace místo holého JSON.
	const pre = admin.config();
	const navigating = req.headers["sec-fetch-mode"] === "navigate" || /text\/html/.test(String(req.headers.accept || ""));
	if (req.method === "GET" && pre.authReady && navigating && !admin.isAuthed(req, pre)) {
		admin.noStore(res);
		res.statusCode = 302;
		res.setHeader("Location", "/admin#/assets");
		return res.end();
	}
	const cfg = admin.guard(req, res, ["GET"]);
	if (!cfg) return;
	const id = admin.param(req, "id");
	if (!/^\d{1,15}$/.test(id)) return admin.sendJson(res, 400, { error: "bad_id" });
	try {
		const response = await admin.github(cfg, admin.repoPath(cfg) + "/releases/assets/" + id, {
			accept: "application/octet-stream",
			redirect: "manual",
		});
		const location = response.headers.get("location");
		if (response.status >= 300 && response.status < 400 && location && /^https:\/\//.test(location)) {
			admin.noStore(res);
			res.statusCode = 302;
			res.setHeader("Location", location);
			return res.end();
		}
		if (response.body && typeof response.body.cancel === "function") await response.body.cancel();
		return admin.sendJson(res, response.status === 404 ? 404 : 502, { error: response.status === 404 ? "not_found" : "github_error", status: response.status });
	} catch (error) {
		return admin.githubError(res, error);
	}
};
