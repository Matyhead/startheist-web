// GET /api/admin/assets -> balíčky assetů: releasy repa hry se štítkem začínajícím "assets-".
// Nový balíček: gh release create assets-<něco> soubory... -R <repo hry> --title "Název" --notes "Popis".
const admin = require("../_lib/admin.js");

module.exports = async (req, res) => {
	const cfg = admin.guard(req, res, ["GET"]);
	if (!cfg) return;
	try {
		const releases = await admin.githubJson(cfg, admin.repoPath(cfg) + "/releases?per_page=100");
		const packs = releases
			.filter((r) => typeof r.tag_name === "string" && r.tag_name.startsWith("assets-") && !r.draft)
			.map((r) => ({
				tag: r.tag_name,
				name: r.name || r.tag_name,
				body: String(r.body || "").slice(0, 20000),
				date: r.published_at || r.created_at || "",
				assets: (r.assets || []).map((a) => ({
					id: a.id,
					name: a.name,
					label: a.label || "",
					size: a.size,
					type: a.content_type || "",
					updated: a.updated_at || "",
				})),
			}))
			.sort((a, b) => a.name.localeCompare(b.name, "cs"));
		return admin.sendJson(res, 200, { repo: cfg.repo, packs });
	} catch (error) {
		return admin.githubError(res, error);
	}
};
