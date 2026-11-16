// POST /api/admin/logout -> smaže cookii přihlášení na tomhle zařízení.
const admin = require("../_lib/admin.js");

module.exports = async (req, res) => {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		return admin.sendJson(res, 405, { error: "method_not_allowed" });
	}
	res.setHeader("Set-Cookie", admin.sessionCookie("", 0));
	return admin.sendJson(res, 200, { ok: true });
};
