// GET /api/admin/docs -> seznam dokumentů z repa hry (docs/**/*.md a CLAUDE.md) s nadpisem a počtem slov.
const admin = require("../_lib/admin.js");

// Nadpisy a počty slov podle otisku obsahu (sha): teplá instance funkce stahuje jen změněné dokumenty.
const meta = new Map();
let listCache = { at: 0, key: "", data: null };
const LIST_TTL_MS = 60 * 1000;

async function blobMeta(cfg, sha) {
	if (meta.has(sha)) return meta.get(sha);
	const response = await admin.github(cfg, admin.repoPath(cfg) + "/git/blobs/" + sha, { accept: "application/vnd.github.raw" });
	if (!response.ok) return { title: "", words: 0 };
	const text = await response.text();
	const heading = text.match(/^#\s+(.+?)\s*#*\s*$/m);
	const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
	const value = { title: heading ? heading[1].replace(/[*_`]/g, "").trim() : "", words };
	meta.set(sha, value);
	return value;
}

async function inBatches(items, size, fn) {
	const out = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
	}
	return out;
}

module.exports = async (req, res) => {
	const cfg = admin.guard(req, res, ["GET"]);
	if (!cfg) return;
	try {
		const key = cfg.repo + "@" + cfg.branch;
		if (listCache.data && listCache.key === key && Date.now() - listCache.at < LIST_TTL_MS) {
			return admin.sendJson(res, 200, listCache.data);
		}
		const repo = admin.repoPath(cfg);
		const root = await admin.githubJson(cfg, repo + "/git/trees/" + encodeURIComponent(cfg.branch));
		const entries = [];
		const claude = root.tree.find((e) => e.path === "CLAUDE.md" && e.type === "blob");
		if (claude) entries.push({ path: "CLAUDE.md", sha: claude.sha, size: claude.size });
		const docs = root.tree.find((e) => e.path === "docs" && e.type === "tree");
		let truncated = Boolean(root.truncated);
		if (docs) {
			const tree = await admin.githubJson(cfg, repo + "/git/trees/" + docs.sha + "?recursive=1");
			truncated = truncated || Boolean(tree.truncated);
			for (const e of tree.tree) {
				const path = "docs/" + e.path;
				if (e.type === "blob" && admin.cleanPath(path, admin.DOC_RE)) entries.push({ path, sha: e.sha, size: e.size });
			}
		}
		const withMeta = await inBatches(entries, 8, async (entry) => Object.assign({}, entry, await blobMeta(cfg, entry.sha)));
		const data = { repo: cfg.repo, branch: cfg.branch, truncated, docs: withMeta };
		listCache = { at: Date.now(), key, data };
		return admin.sendJson(res, 200, data);
	} catch (error) {
		return admin.githubError(res, error);
	}
};
