// GET /api/admin/file?path=docs/... -> obsah dokumentu (md, json) nebo obrázku ze složky docs v repu hry.
const admin = require("../_lib/admin.js");

const TYPES = {
	md: "text/markdown; charset=utf-8",
	json: "application/json; charset=utf-8",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};
const MAX_BYTES = 20 * 1024 * 1024;

module.exports = async (req, res) => {
	const cfg = admin.guard(req, res, ["GET"]);
	if (!cfg) return;
	const path = admin.cleanPath(admin.param(req, "path"), admin.FILE_RE);
	if (!path) return admin.sendJson(res, 400, { error: "bad_path" });
	try {
		const url = admin.repoPath(cfg) + "/contents/" + admin.encodePath(path) + "?ref=" + encodeURIComponent(cfg.branch);
		const response = await admin.github(cfg, url, { accept: "application/vnd.github.raw" });
		if (!response.ok) return admin.sendJson(res, response.status === 404 ? 404 : 502, { error: response.status === 404 ? "not_found" : "github_error" });
		const body = Buffer.from(await response.arrayBuffer());
		if (body.length > MAX_BYTES) return admin.sendJson(res, 413, { error: "too_large" });
		const ext = path.split(".").pop().toLowerCase();
		admin.noStore(res);
		res.statusCode = 200;
		res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
		res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
		res.end(body);
	} catch (error) {
		return admin.githubError(res, error);
	}
};
