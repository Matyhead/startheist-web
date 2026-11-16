// GET /api/admin/session -> je přihlášení nastavené a je tenhle prohlížeč přihlášený?
// Neprozradí nic z obsahu ani hodnoty proměnných, jen jestli jsou vyplněné.
const admin = require("../_lib/admin.js");

module.exports = async (req, res) => {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return admin.sendJson(res, 405, { error: "method_not_allowed" });
	}
	const cfg = admin.config();
	const authed = cfg.authReady && admin.isAuthed(req, cfg);
	return admin.sendJson(res, 200, {
		configured: cfg.authReady,
		authenticated: authed,
		github: authed ? Boolean(cfg.token) : undefined,
	});
};
