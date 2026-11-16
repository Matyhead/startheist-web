// GET /api/admin/history?path=docs/x.md (nebo path=docs) -> poslední změny dokumentu nebo celé složky docs.
const admin = require("../_lib/admin.js");

module.exports = async (req, res) => {
	const cfg = admin.guard(req, res, ["GET"]);
	if (!cfg) return;
	const raw = admin.param(req, "path");
	const path = raw === "docs" ? "docs" : admin.cleanPath(raw, admin.FILE_RE);
	if (!path) return admin.sendJson(res, 400, { error: "bad_path" });
	const limit = Math.min(Math.max(parseInt(admin.param(req, "limit"), 10) || 5, 1), 20);
	try {
		const url = admin.repoPath(cfg) + "/commits?sha=" + encodeURIComponent(cfg.branch) + "&path=" + encodeURIComponent(path) + "&per_page=" + limit;
		const commits = await admin.githubJson(cfg, url);
		return admin.sendJson(res, 200, {
			path,
			commits: commits.map((c) => ({
				sha: String(c.sha || "").slice(0, 7),
				date: (c.commit && c.commit.committer && c.commit.committer.date) || "",
				message: String((c.commit && c.commit.message) || "").split("\n")[0].slice(0, 240),
			})),
		});
	} catch (error) {
		return admin.githubError(res, error);
	}
};
