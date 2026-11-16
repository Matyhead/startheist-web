// Administrace Hush Heist (/admin). Celý obsah (dokumenty, plán, rozhodnutí, balíčky assetů) chodí
// z /api/admin/* až po přihlášení a čte se ze soukromého repa hry. Tady je jen zobrazení.
//
// Co a odkud se zobrazuje, určuje docs/admin/dashboard.json v repu hry (odkazy, připnuté dokumenty,
// skupiny dokumentů a tabulky, ze kterých se skládá přehled a plán). Bez něj platí DEFAULT_DASH.
(() => {
	"use strict";

	const app = document.getElementById("app");

	const DEFAULT_DASH = {
		project: "Hush Heist",
		status: "",
		year_start: { month: 8, year: 2026 },
		milestones: [],
		// Odkud se čtou tabulky (dokument a nadpis oddílu) určuje docs/admin/dashboard.json v repu hry.
		sources: {},
		people: {},
		pinned: [],
		links: [{ label: "Web", url: "https://startheist.com" }, { label: "Media kit", url: "https://startheist.com/press" }],
		doc_groups: [],
		titles: {},
	};

	const DOC_RE = /^(docs\/[A-Za-z0-9._\-/]+\.md|CLAUDE\.md)$/;
	const FILE_RE = /^(docs\/[A-Za-z0-9._\-/]+\.(md|json|png|jpe?g|gif|webp)|CLAUDE\.md)$/i;
	const WEEKDAYS = ["ne", "po", "út", "st", "čt", "pá", "so"];
	const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
	const DAY_MS = 86400000;

	const state = {
		session: null,
		dash: null,
		dashError: "",
		docs: null, // {repo, branch, docs: [...]}
		texts: new Map(), // path -> markdown
		assets: null,
		history: null,
		loadedAt: Date.now(),
	};

	// Každé vykreslení dostane číslo: pomalé načítání po prokliknutí jinam už nic nepřepíše.
	let navSeq = 0;
	let closeLightbox = null;

	function safeDecode(text) {
		try {
			return decodeURIComponent(text);
		} catch (e) {
			return text;
		}
	}

	function announce(text) {
		const status = document.getElementById("status");
		if (status) status.textContent = text || "";
	}

	// ---------------------------------------------------------------- pomocníci

	function el(tag, attrs, ...children) {
		const node = document.createElement(tag);
		for (const [key, value] of Object.entries(attrs || {})) {
			if (value === null || value === undefined || value === false) continue;
			if (key === "class") node.className = value;
			else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
			else if (key === "html") node.innerHTML = value; // jen už očištěné HTML (sanitize)
			else node.setAttribute(key, value === true ? "" : String(value));
		}
		for (const child of children.flat(Infinity)) {
			if (child === null || child === undefined || child === false) continue;
			node.append(child instanceof Node ? child : document.createTextNode(String(child)));
		}
		return node;
	}

	function clear(node) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	class AuthError extends Error {}

	class ApiError extends Error {
		constructor(status, code) {
			super(code || "error " + status);
			this.status = status;
			this.code = code || "";
		}
	}

	async function api(path, options) {
		const response = await fetch(path, Object.assign({ credentials: "same-origin", headers: { Accept: "application/json" } }, options || {}));
		if (response.status === 401) {
			const wasIn = state.session && state.session.authenticated;
			state.session = { configured: true, authenticated: false };
			renderLogin(wasIn ? "Přihlášení vypršelo, přihlas se znovu." : "");
			throw new AuthError("unauthorized");
		}
		if (!response.ok) {
			let code = "";
			try {
				code = (await response.json()).error || "";
			} catch (e) {
				/* nic */
			}
			throw new ApiError(response.status, code);
		}
		return response;
	}

	async function apiJson(path) {
		return (await api(path)).json();
	}

	async function fileText(path) {
		if (state.texts.has(path)) return state.texts.get(path);
		const text = await (await api("/api/admin/file?path=" + encodeURIComponent(path))).text();
		state.texts.set(path, text);
		return text;
	}

	function plural(n, one, few, many) {
		const abs = Math.abs(n);
		return abs === 1 ? one : abs >= 2 && abs <= 4 ? few : many;
	}

	function startOfDay(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
	}

	function today() {
		return startOfDay(new Date());
	}

	function daysBetween(a, b) {
		return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
	}

	function relDays(date) {
		const n = daysBetween(today(), date);
		if (n === 0) return "dnes";
		if (n === 1) return "zítra";
		if (n === -1) return "včera";
		if (n > 0) return "za " + n + " " + plural(n, "den", "dny", "dní");
		return "před " + -n + " " + plural(-n, "dnem", "dny", "dny");
	}

	function fmtDay(date) {
		return WEEKDAYS[date.getDay()] + " " + date.getDate() + ". " + (date.getMonth() + 1) + ".";
	}

	function fmtDate(date) {
		return date.getDate() + ". " + (date.getMonth() + 1) + ". " + date.getFullYear();
	}

	function fmtStamp(iso) {
		const date = new Date(iso);
		if (isNaN(date)) return "";
		return fmtDate(date) + " " + String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
	}

	function fmtSize(bytes) {
		if (!bytes && bytes !== 0) return "";
		if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " kB";
		const mb = bytes / (1024 * 1024);
		return (mb < 10 ? mb.toFixed(1) : Math.round(mb)).toString().replace(".", ",") + " MB";
	}

	function fmtWords(n) {
		if (!n) return "";
		const rounded = n < 1000 ? n : Math.round(n / 100) * 100;
		return "~" + rounded.toLocaleString("cs-CZ") + " slov";
	}

	// --- markdown

	function md(text) {
		const html = window.marked.parse(String(text || ""), { gfm: true, breaks: false });
		return window.DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
	}

	function mdInline(text) {
		const html = window.marked.parseInline(String(text || ""), { gfm: true });
		return window.DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
	}

	function slugify(text, used) {
		let slug = String(text)
			.toLowerCase()
			.trim()
			.replace(/[^\p{L}\p{N}\s_-]/gu, "")
			.replace(/\s/g, "-");
		if (!slug) slug = "oddil";
		if (used) {
			let candidate = slug;
			let i = 1;
			while (used.has(candidate)) candidate = slug + "-" + i++;
			used.add(candidate);
			slug = candidate;
		}
		return slug;
	}

	function resolvePath(base, rel) {
		const parts = base.split("/").slice(0, -1);
		for (const part of rel.split("/")) {
			if (part === "..") parts.pop();
			else if (part && part !== ".") parts.push(part);
		}
		return parts.join("/");
	}

	function docRoute(path, heading) {
		return "#/doc/" + path + (heading ? "?h=" + encodeURIComponent(heading) : "");
	}

	function githubUrl(path, isDir) {
		const repo = (state.docs && state.docs.repo) || "Matyhead/hush-heist";
		const branch = (state.docs && state.docs.branch) || "main";
		return "https://github.com/" + repo + "/" + (isDir ? "tree" : "blob") + "/" + branch + "/" + path;
	}

	// Odkazy z dokumentů: na jiný dokument zůstávají v administraci, na kód vedou na GitHub.
	function fixLinks(root, basePath) {
		for (const a of root.querySelectorAll("a[href]")) {
			const href = a.getAttribute("href");
			if (/^(https?:|mailto:)/i.test(href)) {
				a.target = "_blank";
				a.rel = "noopener noreferrer";
				continue;
			}
			if (!basePath) continue;
			if (href.startsWith("#")) {
				a.setAttribute("href", docRoute(basePath, safeDecode(href.slice(1))));
				continue;
			}
			const [rawPath, hash] = href.split("#");
			const path = safeDecode(rawPath);
			const resolved = resolvePath(basePath, path);
			if (DOC_RE.test(resolved)) {
				a.setAttribute("href", docRoute(resolved, hash ? safeDecode(hash) : ""));
			} else if (resolved) {
				a.setAttribute("href", githubUrl(resolved, path.endsWith("/") || !/\.[a-z0-9]+$/i.test(resolved)));
				a.target = "_blank";
				a.rel = "noopener noreferrer";
			}
		}
		for (const img of root.querySelectorAll("img[src]")) {
			const src = img.getAttribute("src");
			if (/^(https?:|data:)/i.test(src) || !basePath) continue;
			const resolved = resolvePath(basePath, src);
			if (FILE_RE.test(resolved)) img.setAttribute("src", "/api/admin/file?path=" + encodeURIComponent(resolved));
			img.loading = "lazy";
		}
	}

	function htmlBlock(tag, cls, html, basePath) {
		const node = el(tag, { class: cls, html });
		fixLinks(node, basePath);
		return node;
	}

	// --- tabulky z markdownu (přehled a plán čtou tabulky přímo z dokumentu strategie)

	function splitRow(line) {
		let s = line.trim();
		if (s.startsWith("|")) s = s.slice(1);
		if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
		const cells = [];
		let cur = "";
		let code = false;
		for (let i = 0; i < s.length; i++) {
			const c = s[i];
			if (c === "\\" && s[i + 1] === "|") {
				cur += "|";
				i++;
				continue;
			}
			if (c === "`") code = !code;
			if (c === "|" && !code) {
				cells.push(cur.trim());
				cur = "";
				continue;
			}
			cur += c;
		}
		cells.push(cur.trim());
		return cells;
	}

	function sectionTable(text, heading) {
		if (!text || !heading) return null;
		const lines = text.split("\n");
		const want = heading.toLowerCase();
		let i = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.toLowerCase().includes(want));
		if (i < 0) return null;
		const level = lines[i].match(/^#+/)[0].length;
		for (i += 1; i < lines.length; i++) {
			const m = lines[i].match(/^(#{1,6})\s/);
			if (m && m[1].length <= level) return null;
			if (lines[i].trim().startsWith("|")) break;
		}
		const rows = [];
		for (; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(splitRow(lines[i]));
		if (rows.length < 2) return null;
		const head = rows[0].map((h) => h.replace(/[*_`]/g, "").trim().toLowerCase());
		const body = rows.slice(2);
		const col = (...names) => {
			for (const name of names) {
				const at = head.findIndex((h) => h === name || h.startsWith(name));
				if (at >= 0) return at;
			}
			return -1;
		};
		return { head, rows: body, col };
	}

	function cell(row, index) {
		return index >= 0 && index < row.length ? row[index] : "";
	}

	function plain(text) {
		return String(text || "").replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
	}

	// Datum z textu jako "po 16. 11.", "so–ne 21.–22. 11.", "út 24. – čt 26. 11.", "22. 2. – 1. 3.", "~28. 2.".
	const DAY_WORD = "(?:[a-záčďéěíňóřšťúůýž]{2}\\s+)?";
	const R_TWO = new RegExp("(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*[–-]\\s*" + DAY_WORD + "(\\d{1,2})\\.\\s*(\\d{1,2})\\.", "i");
	const R_RANGE = new RegExp("(\\d{1,2})\\.\\s*[–-]\\s*" + DAY_WORD + "(\\d{1,2})\\.\\s*(\\d{1,2})\\.", "i");
	const R_ONE = /(\d{1,2})\.\s*(\d{1,2})\./;

	function parseCzDate(text, yearStart) {
		const s = plain(text);
		const ys = yearStart || DEFAULT_DASH.year_start;
		const make = (d, m) => {
			const day = Number(d);
			const month = Number(m);
			if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
			const year = month >= ys.month ? ys.year : ys.year + 1;
			return new Date(year, month - 1, day);
		};
		const approx = /~|cca|asi/i.test(s);
		let m = s.match(R_TWO);
		if (m) return { start: make(m[1], m[2]), end: make(m[3], m[4]), approx };
		m = s.match(R_RANGE);
		if (m) return { start: make(m[1], m[3]), end: make(m[2], m[3]), approx };
		m = s.match(R_ONE);
		if (m) {
			const d = make(m[1], m[2]);
			return { start: d, end: d, approx };
		}
		return null;
	}

	function isKey(text) {
		return /^\s*\*\*/.test(text || "");
	}

	function calendarRows(text, src, dash) {
		const table = sectionTable(text, src && src.heading);
		if (!table) return [];
		const cDate = table.col("datum", "kdy");
		const cWhat = table.col("co", "milník", "úkol");
		const cWho = table.col("kdo");
		return table.rows
			.map((row) => {
				const dateText = cell(row, cDate);
				const when = parseCzDate(dateText, dash.year_start);
				return when && when.start ? { dateText, when, what: cell(row, cWhat), who: cell(row, cWho), key: isKey(dateText) || isKey(cell(row, cWhat)) } : null;
			})
			.filter(Boolean)
			.sort((a, b) => a.when.start - b.when.start);
	}

	function gateRows(text, src, dash) {
		const table = sectionTable(text, src && src.heading);
		if (!table) return [];
		const cName = table.col("brána", "gate");
		const cWhen = table.col("kdy", "datum");
		const cLook = table.col("na co", "co sleduj");
		const cThen = table.col("co se stane", "potom");
		return table.rows
			.map((row) => {
				const when = parseCzDate(cell(row, cWhen), dash.year_start);
				return { name: cell(row, cName), whenText: cell(row, cWhen), when, look: cell(row, cLook), then: cell(row, cThen) };
			})
			.filter((g) => g.when && g.when.start)
			.sort((a, b) => a.when.start - b.when.start);
	}

	function decisionRows(text, src, dash) {
		const table = sectionTable(text, src && src.heading);
		if (!table) return [];
		const cNum = table.col("#", "č");
		const cWhat = table.col("rozhodnutí");
		const cRec = table.col("doporučení");
		const cDue = table.col("termín");
		const cIfNot = table.col("když ne");
		const cState = table.col("stav");
		return table.rows.map((row) => {
			const stateText = cell(row, cState);
			const lower = plain(stateText).toLowerCase();
			const status = lower.startsWith("rozhodnuto") ? "done" : lower.startsWith("částečně") ? "partial" : "open";
			const dueText = cell(row, cDue);
			// Termín může mít víc dat („dotazník 17. 11., kontrola 4. 1.“): řadí se podle nejbližšího,
			// po termínu je, až když prošla všechna.
			const dates = [];
			for (const m of plain(dueText).matchAll(/(\d{1,2})\.\s*(\d{1,2})\./g)) {
				const d = parseCzDate(m[0], dash.year_start);
				if (d && d.start) dates.push(d.start);
			}
			dates.sort((a, b) => a - b);
			const t = today();
			const due = dates.find((d) => d >= t) || dates[dates.length - 1] || null;
			const lastDue = dates[dates.length - 1] || null;
			return { num: plain(cell(row, cNum)), what: cell(row, cWhat), rec: cell(row, cRec), dueText, due, lastDue, ifNot: cell(row, cIfNot), stateText, status };
		});
	}

	// ---------------------------------------------------------------- data

	// dashboard.json: chybí (404) = výchozí nastavení; rozbitý JSON = výchozí a upozornění;
	// jiná chyba (GitHub, token, síť) jde dál a ukáže se jako chyba, výchozí hodnoty se nepamatují.
	async function loadDash() {
		if (state.dash) return state.dash;
		const path = "docs/admin/dashboard.json";
		let custom = {};
		state.dashError = "";
		try {
			custom = JSON.parse(await fileText(path));
		} catch (e) {
			if (e instanceof SyntaxError) {
				state.texts.delete(path);
				state.dashError = path + " nejde přečíst (" + e.message + "). Platí výchozí nastavení.";
			} else if (!(e instanceof ApiError && e.status === 404)) {
				throw e;
			}
			custom = {};
		}
		if (!custom || typeof custom !== "object" || Array.isArray(custom)) custom = {};
		state.dash = Object.assign({}, DEFAULT_DASH, custom, { sources: Object.assign({}, DEFAULT_DASH.sources, custom.sources || {}) });
		return state.dash;
	}

	async function loadDocs() {
		if (state.docs) return state.docs;
		state.docs = await apiJson("/api/admin/docs");
		return state.docs;
	}

	function docTitle(doc) {
		const dash = state.dash || DEFAULT_DASH;
		if (dash.titles && dash.titles[doc.path]) return dash.titles[doc.path];
		return doc.title || doc.path.split("/").pop().replace(/\.md$/, "").replace(/[-_]/g, " ");
	}

	function docByPath(path) {
		return state.docs && state.docs.docs.find((d) => d.path === path);
	}

	// Zdroj tabulek: chybějící dokument (404) = prázdno s hláškou na místě, ostatní chyby jdou dál.
	async function sourceText(src) {
		if (!src || !src.doc) return "";
		try {
			return await fileText(src.doc);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) return "";
			throw e;
		}
	}

	// ---------------------------------------------------------------- rozložení

	function routeOf() {
		const hash = location.hash.replace(/^#/, "") || "/";
		const [pathPart, queryPart] = hash.split("?");
		const params = new URLSearchParams(queryPart || "");
		if (pathPart.startsWith("/doc/")) return { name: "doc", path: safeDecode(pathPart.slice(5)), heading: params.get("h") || "" };
		if (pathPart === "/plan") return { name: "plan" };
		if (pathPart === "/docs") return { name: "docs", q: params.get("q") || "" };
		if (pathPart === "/assets") return { name: "assets" };
		return { name: "home" };
	}

	function shell(active) {
		if (closeLightbox) closeLightbox();
		clear(app);
		app.className = "app";
		const nav = [
			["home", "#/", "Přehled"],
			["plan", "#/plan", "Plán"],
			["docs", "#/docs", "Dokumenty"],
			["assets", "#/assets", "Assety"],
		];
		const header = el(
			"header",
			{ class: "top" },
			el(
				"div",
				{ class: "top__in" },
				el("a", { class: "brand", href: "#/" }, el("img", { src: "/assets/img/icon.svg", alt: "", width: "28", height: "28" }), el("span", { class: "brand__name" }, "Hush Heist"), el("span", { class: "brand__tag" }, "admin")),
				el(
					"nav",
					{ class: "nav", "aria-label": "Administrace" },
					nav.map(([key, href, label]) => {
						const on = key === active || (active === "doc" && key === "docs");
						return el("a", { href, class: "nav__link" + (on ? " is-active" : ""), "aria-current": on ? "page" : null }, label);
					})
				),
				el(
					"div",
					{ class: "top__actions" },
					el("button", { class: "btn btn--ghost btn--small", type: "button", title: "Načíst znovu z repa hry", onclick: () => refresh() }, "Obnovit"),
					el("button", { class: "btn btn--ghost btn--small", type: "button", onclick: logout }, "Odhlásit")
				)
			)
		);
		const main = el("main", { class: "main", id: "main" });
		app.append(header, main);
		return main;
	}

	function loading(main, text) {
		clear(main);
		main.append(el("p", { class: "muted pad" }, text || "Načítám…"));
		announce(text || "Načítám…");
	}

	// Jak se na stránku přišlo: číslo = Zpět/Vpřed (obnovit posun), jinak nahoru nebo na nadpis.
	let pendingScroll = null;

	function scrollToHeading(heading) {
		const top = document.querySelector(".top");
		document.documentElement.style.scrollPaddingTop = (top ? top.offsetHeight : 0) + 12 + "px";
		if (!heading) {
			window.scrollTo(0, 0);
			return;
		}
		let target = document.getElementById(heading) || document.getElementById(slugify(heading));
		if (!target) {
			const want = heading.toLowerCase();
			const wantSlug = slugify(heading);
			target = Array.from(document.querySelectorAll(".prose h1, .prose h2, .prose h3, .prose h4")).find((h) => h.textContent.toLowerCase().includes(want) || h.id.includes(wantSlug)) || null;
		}
		if (target) target.scrollIntoView({ block: "start" });
		else window.scrollTo(0, 0);
	}

	// Konec vykreslení: fokus na nadpis (kvůli čtečkám), krátké oznámení a posun.
	function finish(main, heading, fallback) {
		if (!main.isConnected) return;
		const h1 = main.querySelector("h1, h2");
		if (h1) {
			h1.setAttribute("tabindex", "-1");
			h1.focus({ preventScroll: true });
		}
		announce(document.title.replace(" · Hush Heist admin", ""));
		const restore = pendingScroll;
		pendingScroll = null;
		if (typeof restore === "number") {
			requestAnimationFrame(() => window.scrollTo(0, restore));
			return;
		}
		if (heading) return scrollToHeading(heading);
		if (fallback) return fallback();
		window.scrollTo(0, 0);
	}

	function showError(main, error) {
		if (error instanceof AuthError || !main.isConnected) return;
		clear(main);
		const box = el("div", { class: "card card--red notice" });
		if (error instanceof ApiError && error.code === "github_not_configured") {
			box.append(
				el("h2", { class: "h2" }, "Chybí token pro GitHub"),
				el("p", null, "Přihlášení funguje, ale administrace nemá čím číst soukromé repo hry. Ve Vercelu doplň proměnnou GITHUB_TOKEN (fine-grained token, jen čtení obsahu repa hry) a nasaď web znovu.")
			);
		} else if (error instanceof ApiError && error.status === 404) {
			box.append(el("h2", { class: "h2" }, "Nenalezeno"), el("p", null, "Tenhle soubor v repu hry není (možná se přejmenoval)."), el("p", null, el("a", { href: "#/docs" }, "Zpět na dokumenty")));
		} else {
			box.append(
				el("h2", { class: "h2" }, "Něco se nepovedlo"),
				el("p", null, "Server nebo GitHub neodpověděl. Zkus to za chvíli znovu."),
				el("p", { class: "muted small" }, String((error && (error.code || error.message)) || error))
			);
		}
		main.append(box);
		finish(main);
	}

	// ---------------------------------------------------------------- přihlášení

	function renderLogin(message) {
		clear(app);
		app.className = "app app--login";
		const configured = !state.session || state.session.configured !== false;
		const error = el("p", { class: "login__error", role: "alert" }, message || "");
		const input = el("input", { class: "input", type: "password", name: "password", id: "password", autocomplete: "current-password", required: true, autofocus: true, "aria-describedby": "login-error" });
		error.id = "login-error";
		const button = el("button", { class: "btn btn--gold", type: "submit" }, "Přihlásit");
		const form = el(
			"form",
			{
				class: "login card",
				onsubmit: async (event) => {
					event.preventDefault();
					button.disabled = true;
					error.textContent = "";
					try {
						const response = await fetch("/api/admin/login", {
							method: "POST",
							credentials: "same-origin",
							headers: { "Content-Type": "application/json", Accept: "application/json" },
							body: JSON.stringify({ password: input.value }),
						});
						if (response.ok) {
							state.session = { configured: true, authenticated: true };
							input.value = "";
							route();
							return;
						}
						const data = await response.json().catch(() => ({}));
						error.textContent = data.error === "not_configured" ? "Přihlášení ještě není nastavené (chybí proměnné ve Vercelu)." : response.status === 401 ? "Špatné heslo." : "Přihlášení se nepovedlo (" + response.status + ").";
					} catch (e) {
						error.textContent = "Server neodpovídá.";
					} finally {
						button.disabled = false;
						input.focus();
					}
				},
			},
			el("img", { class: "login__logo", src: "/assets/img/icon.svg", alt: "", width: "56", height: "56" }),
			el("h1", { class: "login__title" }, "Hush Heist"),
			el("p", { class: "login__sub" }, "Administrace projektu"),
			configured
				? [el("label", { class: "label", for: "password" }, "Heslo"), input, button, error]
				: el(
						"div",
						{ class: "notice" },
						el("p", null, "Přihlášení ještě není nastavené."),
						el("p", { class: "muted small" }, "Ve Vercelu (Project › Settings › Environment Variables) doplň ADMIN_PASSWORD (aspoň 20 znaků, vygenerované), ADMIN_SECRET (aspoň 32 náhodných znaků) a GITHUB_TOKEN a nasaď web znovu.")
				  )
		);
		app.append(el("main", { class: "login-wrap" }, form));
		if (configured) setTimeout(() => input.focus(), 0);
	}

	async function logout() {
		try {
			await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
		} catch (e) {
			/* nic */
		}
		state.session = { configured: true, authenticated: false };
		invalidate();
		history.replaceState(null, "", location.pathname);
		renderLogin();
	}

	function invalidate() {
		state.dash = null;
		state.dashError = "";
		state.docs = null;
		state.assets = null;
		state.history = null;
		state.texts.clear();
		state.loadedAt = Date.now();
	}

	// Data se drží v paměti stránky; Obnovit (nebo návrat do záložky po minutě) je načte znovu.
	function refresh() {
		invalidate();
		pendingScroll = window.scrollY;
		route();
	}

	// ---------------------------------------------------------------- přehled

	function countdownTile(label, date, note, extra, end) {
		const t = today();
		const n = daysBetween(t, date);
		const ongoing = n < 0 && end && startOfDay(end) >= t;
		const big = ongoing ? "teď" : n > 0 ? String(n) : n === 0 ? "dnes" : "✓";
		const unit = ongoing ? "probíhá do " + fmtDay(end) : n > 0 ? plural(n, "den", "dny", "dní") : n === 0 ? "" : "proběhlo";
		const range = end && startOfDay(end) - startOfDay(date) > 0;
		return el(
			"div",
			{ class: "tile" + (extra || "") },
			el("p", { class: "tile__label" }, label),
			el("p", { class: "tile__big" }, big),
			el("p", { class: "tile__unit" }, unit),
			el("p", { class: "tile__date" }, fmtDay(date) + (range ? " – " + fmtDay(end) : "") + " " + (range ? end : date).getFullYear()),
			note ? el("p", { class: "tile__note" }, note) : null
		);
	}

	function whoChips(who, dash) {
		const people = dash.people || {};
		return plain(who)
			.split(/[,+]/)
			.map((s) => s.trim())
			.filter(Boolean)
			.map((code) => {
				const short = code.split(/\s/)[0];
				return el("span", { class: "chip", title: people[short] || code }, code);
			});
	}

	function milestoneItem(row, dash, basePath) {
		const t = today();
		const past = row.when.end < t;
		const now = row.when.start <= t && row.when.end >= t;
		const range = row.when.end && row.when.end - row.when.start > 0;
		return el(
			"li",
			{ class: "ms" + (row.key ? " ms--key" : "") + (past ? " ms--past" : "") + (now ? " ms--now" : "") },
			el(
				"div",
				{ class: "ms__date" },
				el("span", { class: "ms__day" }, (row.when.approx ? "~" : "") + fmtDay(row.when.start) + (range ? " – " + fmtDay(row.when.end) : "")),
				el("span", { class: "ms__rel" }, now && range ? "probíhá" : relDays(row.when.start))
			),
			htmlBlock("div", "ms__what", mdInline(row.what), basePath),
			el("div", { class: "ms__who" }, whoChips(row.who, dash))
		);
	}

	function decisionItem(d, basePath) {
		const overdue = d.status !== "done" && d.lastDue && d.lastDue < today();
		return el(
			"li",
			{ class: "dec dec--" + d.status + (overdue ? " dec--late" : "") },
			el("span", { class: "dec__num" }, d.num),
			el(
				"div",
				{ class: "dec__body" },
				htmlBlock("p", "dec__what", mdInline(d.what), basePath),
				htmlBlock("p", "dec__rec", mdInline(d.rec), basePath),
				d.stateText ? htmlBlock("p", "dec__state", mdInline(d.stateText), basePath) : null
			),
			el("span", { class: "dec__due" + (overdue ? " is-late" : "") }, (overdue ? "po termínu · " : "") + plain(d.dueText))
		);
	}

	async function renderHome() {
		const main = shell("home");
		loading(main);
		try {
			const dash = await loadDash();
			const [calText, decText, gateText, docs, hist] = await Promise.all([
				sourceText(dash.sources.calendar),
				sourceText(dash.sources.decisions),
				sourceText(dash.sources.gates),
				loadDocs().catch((e) => {
					if (e instanceof AuthError) throw e;
					return null;
				}),
				state.history ? Promise.resolve(state.history) : apiJson("/api/admin/history?path=docs&limit=8").catch(() => null),
			]);
			if (!main.isConnected) return;
			state.history = hist;
			const cal = calendarRows(calText, dash.sources.calendar, dash);
			const gates = gateRows(gateText, dash.sources.gates, dash);
			const decisions = decisionRows(decText, dash.sources.decisions, dash);
			const t = today();
			clear(main);

			const now = new Date();
			main.append(
				el(
					"section",
					{ class: "hello" },
					el("p", { class: "eyebrow" }, fmtDay(now) + " " + now.getFullYear()),
					el("h1", { class: "h1" }, "Přehled projektu"),
					dash.status ? el("p", { class: "lead" }, dash.status) : null
				)
			);
			if (state.dashError) main.append(el("p", { class: "card card--red notice" }, state.dashError));

			const tiles = el("section", { class: "tiles", "aria-label": "Odpočty" });
			for (const m of dash.milestones || []) {
				const date = new Date(m.date);
				if (!isNaN(date)) tiles.append(countdownTile(m.label, date, m.note, " tile--gold"));
			}
			// Nejbližší budoucí (nebo dnešní) milník; probíhající vícedenní jen když žádný budoucí není.
			const nextMs = cal.find((r) => r.when.start >= t) || cal.find((r) => r.when.end >= t);
			if (nextMs) tiles.append(countdownTile("Další milník", nextMs.when.start, plain(nextMs.what).slice(0, 140), "", nextMs.when.end));
			const nextGate = gates.find((g) => g.when.start >= t) || gates.find((g) => g.when.end >= t);
			if (nextGate) tiles.append(countdownTile("Další brána · " + plain(nextGate.name), nextGate.when.start, plain(nextGate.look).slice(0, 140), " tile--blue", nextGate.when.end));
			if (tiles.childNodes.length) main.append(tiles);

			const grid = el("div", { class: "grid2" });
			const soon = cal.filter((r) => r.when.end >= t && r.when.start <= new Date(t.getTime() + 14 * DAY_MS));
			const calBase = dash.sources.calendar && dash.sources.calendar.doc;
			grid.append(
				el(
					"section",
					{ class: "card" },
					el("div", { class: "card__head" }, el("h2", { class: "h2" }, "Nejbližších 14 dní"), el("a", { class: "more", href: "#/plan" }, "Celý plán")),
					soon.length ? el("ol", { class: "ms-list" }, soon.map((r) => milestoneItem(r, dash, calBase))) : el("p", { class: "muted" }, cal.length ? "Na příštích 14 dní nic naplánovaného." : "Kalendář v dokumentu strategie se nenašel.")
				)
			);

			const open = decisions.filter((d) => d.status !== "done").sort((a, b) => (a.due || 8.64e15) - (b.due || 8.64e15));
			const done = decisions.filter((d) => d.status === "done");
			const decBase = dash.sources.decisions && dash.sources.decisions.doc;
			const decCard = el(
				"section",
				{ class: "card" },
				el(
					"div",
					{ class: "card__head" },
					el("h2", { class: "h2" }, "Rozhodnutí majitele"),
					decBase ? el("a", { class: "more", href: docRoute(decBase, "") }, "V dokumentu") : null
				)
			);
			if (!decisions.length) decCard.append(el("p", { class: "muted" }, "Tabulka rozhodnutí se v dokumentu nenašla."));
			else {
				decCard.append(el("p", { class: "muted small" }, open.length + " " + plural(open.length, "otevřené", "otevřená", "otevřených") + ", " + done.length + " " + plural(done.length, "rozhodnuté", "rozhodnutá", "rozhodnutých")));
				decCard.append(el("ol", { class: "dec-list" }, open.map((d) => decisionItem(d, decBase))));
				if (done.length) decCard.append(el("details", { class: "fold" }, el("summary", null, "Rozhodnuto (" + done.length + ")"), el("ol", { class: "dec-list" }, done.map((d) => decisionItem(d, decBase)))));
			}
			grid.append(decCard);
			main.append(grid);

			const grid2 = el("div", { class: "grid2" });
			if ((dash.pinned || []).length) {
				grid2.append(
					el(
						"section",
						{ class: "card" },
						el("div", { class: "card__head" }, el("h2", { class: "h2" }, "Klíčové dokumenty"), el("a", { class: "more", href: "#/docs" }, "Všechny")),
						el(
							"ul",
							{ class: "pins" },
							dash.pinned.map((p) => {
								const doc = docs && docs.docs.find((d) => d.path === p.doc);
								return el("li", null, el("a", { class: "pin", href: docRoute(p.doc, "") }, el("span", { class: "pin__title" }, doc ? docTitle(doc) : p.doc.split("/").pop()), p.note ? el("span", { class: "pin__note" }, p.note) : null));
							})
						)
					)
				);
			}
			const side = el("div", { class: "stack" });
			if ((dash.links || []).length) {
				side.append(
					el(
						"section",
						{ class: "card" },
						el("h2", { class: "h2" }, "Odkazy"),
						el(
							"ul",
							{ class: "links" },
							dash.links.map((l) => el("li", null, el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.label), l.note ? el("span", { class: "muted small" }, " · " + l.note) : null))
						)
					)
				);
			}
			if (hist && hist.commits && hist.commits.length) {
				side.append(
					el(
						"section",
						{ class: "card" },
						el("h2", { class: "h2" }, "Poslední změny dokumentů"),
						el(
							"ul",
							{ class: "commits" },
							hist.commits.map((c) => el("li", null, el("span", { class: "commits__date" }, fmtStamp(c.date)), el("span", { class: "commits__msg" }, c.message)))
						)
					)
				);
			}
			grid2.append(side);
			main.append(grid2);
			finish(main);
		} catch (error) {
			showError(main, error);
		}
	}

	// ---------------------------------------------------------------- plán

	async function renderPlan() {
		const main = shell("plan");
		loading(main);
		try {
			const dash = await loadDash();
			const [calText, gateText] = await Promise.all([sourceText(dash.sources.calendar), sourceText(dash.sources.gates)]);
			if (!main.isConnected) return;
			const cal = calendarRows(calText, dash.sources.calendar, dash);
			const gates = gateRows(gateText, dash.sources.gates, dash);
			const calBase = dash.sources.calendar && dash.sources.calendar.doc;
			const gateBase = dash.sources.gates && dash.sources.gates.doc;
			const t = today();
			clear(main);
			main.append(
				el(
					"section",
					{ class: "hello" },
					el("p", { class: "eyebrow" }, "Roadmapa"),
					el("h1", { class: "h1" }, "Plán do vydání"),
					el(
						"p",
						{ class: "lead" },
						"Milníky a brány se čtou přímo z dokumentu strategie, takže jsou vždycky aktuální. ",
						calBase ? el("a", { href: docRoute(calBase, dash.sources.calendar.heading ? slugify(dash.sources.calendar.heading) : "") }, "Otevřít zdroj") : null
					)
				)
			);
			const people = Object.entries(dash.people || {});
			if (people.length) main.append(el("p", { class: "legend" }, people.map(([k, v]) => el("span", { class: "legend__item" }, el("span", { class: "chip" }, k), " " + v))));
			if (!cal.length) main.append(el("p", { class: "card muted" }, "Kalendář se v dokumentu nenašel. Zkontroluj sources.calendar v docs/admin/dashboard.json."));
			else {
				const timeline = el("div", { class: "timeline" });
				let month = "";
				let list = null;
				let todayPlaced = false;
				for (const row of cal) {
					const key = row.when.start.getFullYear() + "-" + row.when.start.getMonth();
					if (key !== month) {
						month = key;
						list = el("ol", { class: "ms-list ms-list--plan" });
						timeline.append(el("section", { class: "month" }, el("h2", { class: "month__title" }, MONTHS[row.when.start.getMonth()] + " " + row.when.start.getFullYear()), list));
					}
					if (!todayPlaced && row.when.end >= t) {
						list.append(el("li", { class: "today-line", "aria-label": "Dnes" }, el("span", null, "Dnes · " + fmtDay(t))));
						todayPlaced = true;
					}
					list.append(milestoneItem(row, dash, calBase));
				}
				main.append(timeline);
			}
			if (gates.length) {
				const next = gates.find((g) => g.when.end >= t);
				main.append(
					el(
						"section",
						{ class: "gates" },
						el("h2", { class: "h2" }, "Brány"),
						el("p", { class: "muted" }, "Den, kdy se podle čísel rozhodne, jestli plán platí beze změny."),
						el(
							"div",
							{ class: "gate-grid" },
							gates.map((g) =>
								el(
									"article",
									{ class: "gate" + (g.when.end < t ? " gate--past" : "") + (g === next ? " gate--next" : "") },
									el("p", { class: "gate__top" }, el("span", { class: "gate__name" }, plain(g.name)), el("span", { class: "gate__when" }, fmtDay(g.when.start) + " · " + relDays(g.when.start))),
									htmlBlock("p", "gate__look", mdInline(g.look), gateBase),
									htmlBlock("p", "gate__then", mdInline(g.then), gateBase)
								)
							)
						)
					)
				);
			}
			finish(main, "", () => {
				const nowEl = main.querySelector(".today-line");
				const top = document.querySelector(".top");
				if (nowEl) window.scrollTo(0, Math.max(0, nowEl.getBoundingClientRect().top + window.scrollY - (top ? top.offsetHeight : 0) - 120));
				else window.scrollTo(0, 0);
			});
		} catch (error) {
			showError(main, error);
		}
	}

	// ---------------------------------------------------------------- dokumenty

	function groupDocs(docs, dash) {
		const groups = (dash.doc_groups || []).map((g) => ({ label: g.label, match: g.match || [], exclude: g.exclude || [], docs: [] }));
		const other = { label: "Ostatní", docs: [] };
		for (const doc of docs) {
			const group = groups.find((g) => g.match.some((m) => doc.path === m || doc.path.startsWith(m)) && !g.exclude.some((x) => doc.path.startsWith(x)));
			(group || other).docs.push(doc);
		}
		if (other.docs.length) groups.push(other);
		for (const g of groups) g.docs.sort((a, b) => docTitle(a).localeCompare(docTitle(b), "cs"));
		return groups.filter((g) => g.docs.length);
	}

	async function renderDocs(params) {
		const main = shell("docs");
		loading(main);
		try {
			const [dash, data] = await Promise.all([loadDash(), loadDocs()]);
			if (!main.isConnected) return;
			clear(main);
			const search = el("input", { class: "input input--search", type: "search", placeholder: "Hledat v názvech dokumentů…", "aria-label": "Hledat dokumenty", value: params.q || "" });
			const list = el("div", { class: "doc-groups" });
			const draw = () => {
				const q = search.value.trim().toLowerCase();
				clear(list);
				const filtered = data.docs.filter((d) => !q || docTitle(d).toLowerCase().includes(q) || d.path.toLowerCase().includes(q));
				const groups = groupDocs(filtered, dash);
				if (!groups.length) list.append(el("p", { class: "muted" }, "Nic nenalezeno."));
				for (const g of groups) {
					list.append(
						el(
							"section",
							{ class: "card doc-group" },
							el("h2", { class: "h2" }, g.label, el("span", { class: "count" }, String(g.docs.length))),
							el(
								"ul",
								{ class: "doc-list" },
								g.docs.map((d) => el("li", null, el("a", { class: "doc-link", href: docRoute(d.path, "") }, el("span", { class: "doc-link__title" }, docTitle(d)), el("span", { class: "doc-link__meta" }, d.path + (d.words ? " · " + fmtWords(d.words) : "")))))
							)
						)
					);
				}
			};
			let announceTimer = 0;
			search.addEventListener("input", () => {
				draw();
				history.replaceState(null, "", "#/docs" + (search.value ? "?q=" + encodeURIComponent(search.value) : ""));
				clearTimeout(announceTimer);
				announceTimer = setTimeout(() => {
					const n = list.querySelectorAll(".doc-link").length;
					announce(n + " " + plural(n, "dokument", "dokumenty", "dokumentů"));
				}, 400);
			});
			main.append(
				el("section", { class: "hello" }, el("p", { class: "eyebrow" }, (data.docs.length || 0) + " " + plural(data.docs.length, "dokument", "dokumenty", "dokumentů")), el("h1", { class: "h1" }, "Dokumenty"), el("p", { class: "lead" }, "Všechno ze složky docs v repu hry, vždycky v aktuální verzi.")),
				search,
				list
			);
			if (data.truncated) main.append(el("p", { class: "muted small" }, "GitHub vrátil zkrácený seznam souborů, některé dokumenty můžou chybět."));
			draw();
			finish(main);
		} catch (error) {
			showError(main, error);
		}
	}

	function decorateDoc(article) {
		const used = new Set();
		const toc = [];
		for (const h of article.querySelectorAll("h1, h2, h3")) {
			h.id = slugify(h.textContent, used);
			if (h.tagName !== "H1") toc.push({ level: h.tagName === "H2" ? 2 : 3, id: h.id, text: h.textContent });
		}
		for (const table of article.querySelectorAll("table")) {
			const wrap = el("div", { class: "table-wrap" });
			table.replaceWith(wrap);
			wrap.append(table);
		}
		for (const pre of article.querySelectorAll("pre")) {
			const button = el(
				"button",
				{
					class: "copy",
					type: "button",
					onclick: async () => {
						try {
							await navigator.clipboard.writeText(pre.innerText);
							button.textContent = "Zkopírováno";
						} catch (e) {
							button.textContent = "Nejde kopírovat";
						}
						setTimeout(() => (button.textContent = "Kopírovat"), 1600);
					},
				},
				"Kopírovat"
			);
			const wrap = el("div", { class: "pre-wrap" });
			pre.replaceWith(wrap);
			wrap.append(button, pre);
		}
		return toc;
	}

	async function renderDoc(params) {
		const main = shell("doc");
		loading(main);
		const path = params.path;
		if (!DOC_RE.test(path)) return showError(main, new ApiError(404, "not_found"));
		try {
			await loadDash();
			const [text] = await Promise.all([
				fileText(path),
				loadDocs().catch((e) => {
					if (e instanceof AuthError) throw e;
					return null;
				}),
			]);
			if (!main.isConnected) return;
			const doc = docByPath(path);
			document.title = (doc ? docTitle(doc) : path) + " · Hush Heist admin";
			clear(main);
			const article = htmlBlock("article", "prose", md(text), path);
			const toc = decorateDoc(article);
			const meta = el("p", { class: "doc-meta" }, el("span", { class: "doc-meta__path" }, path), doc && doc.words ? el("span", null, " · " + fmtWords(doc.words)) : null, " · ", el("a", { href: githubUrl(path, false), target: "_blank", rel: "noopener noreferrer" }, "Na GitHubu"));
			const changes = el("p", { class: "doc-meta doc-meta--changes" });
			const tocNav = toc.length
				? el(
						"nav",
						{ class: "toc", "aria-label": "Obsah dokumentu" },
						el("p", { class: "toc__title" }, "Obsah"),
						el(
							"ol",
							null,
							toc.map((item) =>
								el(
									"li",
									{ class: "toc__l" + item.level },
									el(
										"a",
										{
											href: docRoute(path, item.id),
											onclick: (event) => {
												event.preventDefault();
												history.replaceState(null, "", docRoute(path, item.id));
												scrollToHeading(item.id);
											},
										},
										item.text
									)
								)
							)
						)
				  )
				: null;
			const layout = el(
				"div",
				{ class: "doc" + (tocNav ? "" : " doc--wide") },
				el("div", { class: "doc__main" }, el("p", { class: "crumbs" }, el("a", { href: "#/docs" }, "Dokumenty"), " / ", path.split("/").slice(0, -1).join("/") || "kořen repa"), meta, changes, article),
				tocNav ? el("aside", { class: "doc__toc" }, el("details", { class: "toc-fold", open: window.matchMedia("(min-width: 1101px)").matches }, el("summary", null, "Obsah"), tocNav)) : null
			);
			main.append(layout);
			finish(main, params.heading);
			apiJson("/api/admin/history?path=" + encodeURIComponent(path) + "&limit=3")
				.then((h) => {
					if (h && h.commits && h.commits.length) changes.append("Naposledy upraveno " + fmtStamp(h.commits[0].date) + ": " + h.commits[0].message);
				})
				.catch(() => {});
		} catch (error) {
			showError(main, error);
		}
	}

	// ---------------------------------------------------------------- assety

	function extOf(name) {
		const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
		return m ? m[1] : "";
	}

	function isImage(a) {
		return /^image\//.test(a.type) || ["png", "jpg", "jpeg", "gif", "webp"].includes(extOf(a.name));
	}

	function isVideo(a) {
		return /^video\//.test(a.type) || ["mp4", "webm", "mov"].includes(extOf(a.name));
	}

	function dl(a) {
		return "/api/admin/download?id=" + encodeURIComponent(a.id);
	}

	function openLightbox(asset) {
		if (closeLightbox) closeLightbox();
		const opener = document.activeElement;
		const close = () => {
			box.remove();
			document.removeEventListener("keydown", onKey);
			closeLightbox = null;
			if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
		};
		const onKey = (event) => {
			if (event.key === "Escape") close();
			// Fokus zůstane uvnitř okna (Tab mezi Stáhnout a Zavřít).
			if (event.key === "Tab") {
				const items = Array.from(box.querySelectorAll("a, button"));
				const at = items.indexOf(document.activeElement);
				event.preventDefault();
				items[(at + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
			}
		};
		const box = el(
			"div",
			{ class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": asset.name, onclick: (event) => event.target === box && close() },
			el("figure", { class: "lightbox__fig" }, el("img", { src: dl(asset), alt: asset.name }), el("figcaption", null, asset.name + " · " + fmtSize(asset.size) + " ", el("a", { class: "btn btn--gold btn--small", href: dl(asset) }, "Stáhnout"), " ", el("button", { class: "btn btn--ghost btn--small", type: "button", onclick: close }, "Zavřít")))
		);
		document.addEventListener("keydown", onKey);
		document.body.append(box);
		closeLightbox = close;
		box.querySelector("button").focus();
	}

	// Náhled se nenačte, když přihlášení vypršelo nebo odkaz GitHubu nejde: místo rozbitého obrázku text.
	function thumbError(event) {
		const img = event.target;
		const holder = img.parentElement;
		if (!holder) return;
		img.remove();
		if (!holder.querySelector(".asset__missing")) holder.append(el("span", { class: "asset__missing" }, "Náhled se nenačetl"));
		fetch("/api/admin/session", { credentials: "same-origin" })
			.then((r) => r.json())
			.then((sess) => {
				if (sess && sess.configured && !sess.authenticated && state.session && state.session.authenticated) {
					state.session = { configured: true, authenticated: false };
					renderLogin("Přihlášení vypršelo, přihlas se znovu.");
				}
			})
			.catch(() => {});
	}

	function assetCard(a, pack) {
		if (isImage(a) && !/poster/i.test(a.name)) {
			return el(
				"figure",
				{ class: "asset asset--img" },
				el("button", { class: "asset__thumb", type: "button", onclick: () => openLightbox(a), "aria-label": "Zvětšit " + a.name }, el("img", { src: dl(a), alt: "", loading: "lazy", onerror: thumbError })),
				el("figcaption", { class: "asset__cap" }, el("span", { class: "asset__name" }, a.label || a.name), el("span", { class: "asset__size" }, fmtSize(a.size)), el("a", { class: "asset__dl", href: dl(a) }, "Stáhnout"))
			);
		}
		if (isVideo(a)) {
			const base = a.name.replace(/[-_]?preview/i, "").replace(/\.[a-z0-9]+$/i, "");
			const poster = pack.assets.find((x) => isImage(x) && /poster/i.test(x.name) && x.name.startsWith(base));
			const inline = /preview/i.test(a.name);
			return el(
				"figure",
				{ class: "asset asset--video" },
				inline
					? el("video", { controls: true, preload: "none", playsinline: true, poster: poster ? dl(poster) : null, src: dl(a) })
					: el("div", { class: "asset__file asset__file--video" }, poster ? el("img", { src: dl(poster), alt: "", loading: "lazy", onerror: thumbError }) : el("span", { class: "asset__ext" }, extOf(a.name))),
				el("figcaption", { class: "asset__cap" }, el("span", { class: "asset__name" }, a.label || a.name), el("span", { class: "asset__size" }, fmtSize(a.size)), el("a", { class: "asset__dl", href: dl(a) }, "Stáhnout"))
			);
		}
		if (isImage(a)) return null; // plakátek videa se ukazuje u videa
		return el(
			"figure",
			{ class: "asset asset--file" + (extOf(a.name) === "zip" ? " asset--zip" : "") },
			el("div", { class: "asset__file" }, el("span", { class: "asset__ext" }, extOf(a.name) || "soubor")),
			el("figcaption", { class: "asset__cap" }, el("span", { class: "asset__name" }, a.label || a.name), el("span", { class: "asset__size" }, fmtSize(a.size)), el("a", { class: "asset__dl", href: dl(a) }, "Stáhnout"))
		);
	}

	async function renderAssets() {
		const main = shell("assets");
		loading(main);
		try {
			if (!state.assets) state.assets = await apiJson("/api/admin/assets");
			if (!main.isConnected) return;
			const data = state.assets;
			clear(main);
			main.append(
				el("section", { class: "hello" }, el("p", { class: "eyebrow" }, "Obrázky, videa, loga"), el("h1", { class: "h1" }, "Balíčky assetů"), el("p", { class: "lead" }, "Soubory jsou soukromé v repu hry (releasy se štítkem assets-). Odkaz ke stažení platí jen pár minut, sdílet se nedá.")),
				el(
					"section",
					{ class: "card card--gold public" },
					el("h2", { class: "h2" }, "Veřejný media kit"),
					el("p", null, "To, co vidí novináři na webu: fact sheet, snímky, key art a loga."),
					el("p", { class: "row" }, el("a", { class: "btn btn--gold", href: "/press", target: "_blank", rel: "noopener" }, "Otevřít /press"), el("a", { class: "btn btn--ghost", href: "/assets/press/hush-heist-presskit.zip" }, "Stáhnout ZIP"))
				)
			);
			if (!data.packs.length) {
				main.append(el("p", { class: "card muted" }, "Zatím žádný balíček. Nový přidáš příkazem: gh release create assets-nazev soubory… -R " + data.repo + ' --title "Název" --notes "Popis"'));
				finish(main);
				return;
			}
			for (const pack of data.packs) {
				const zips = pack.assets.filter((a) => extOf(a.name) === "zip");
				const rest = pack.assets.filter((a) => extOf(a.name) !== "zip");
				const cards = rest.map((a) => assetCard(a, pack)).filter(Boolean);
				main.append(
					el(
						"section",
						{ class: "card pack" },
						el(
							"div",
							{ class: "card__head" },
							el("h2", { class: "h2" }, pack.name),
							el("span", { class: "muted small" }, (pack.date ? fmtDate(new Date(pack.date)) + " · " : "") + pack.assets.length + " " + plural(pack.assets.length, "soubor", "soubory", "souborů"))
						),
						pack.body ? htmlBlock("div", "pack__body prose prose--small", md(pack.body), null) : null,
						zips.length ? el("p", { class: "row" }, zips.map((z) => el("a", { class: "btn btn--gold", href: dl(z) }, "Stáhnout " + (z.label || z.name) + " · " + fmtSize(z.size)))) : null,
						cards.length ? el("div", { class: "asset-grid" }, cards) : null
					)
				);
			}
			finish(main);
		} catch (error) {
			showError(main, error);
		}
	}

	// ---------------------------------------------------------------- start

	let lastRoute = "";

	function routeKey(r) {
		return r.name + ":" + (r.path || "");
	}

	function route() {
		navSeq += 1;
		if (!state.session || !state.session.authenticated) return renderLogin();
		const r = routeOf();
		lastRoute = routeKey(r);
		document.title = "Hush Heist · Administrace";
		if (r.name === "plan") return renderPlan();
		if (r.name === "docs") return renderDocs(r);
		if (r.name === "doc") return renderDoc(r);
		if (r.name === "assets") return renderAssets();
		return renderHome();
	}

	// Posun stránky pro každou adresu (kvůli tlačítku Zpět): ukládá se do sessionStorage.
	const SCROLL_KEY = "hh-admin-scroll";
	function savedScroll() {
		try {
			return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
		} catch (e) {
			return {};
		}
	}
	function saveScroll(hash, y) {
		try {
			const all = savedScroll();
			all[hash] = Math.round(y);
			const keys = Object.keys(all);
			if (keys.length > 60) delete all[keys[0]];
			sessionStorage.setItem(SCROLL_KEY, JSON.stringify(all));
		} catch (e) {
			/* bez úložiště se posun jen nepamatuje */
		}
	}
	if ("scrollRestoration" in history) history.scrollRestoration = "manual";
	let scrollTimer = 0;
	window.addEventListener("scroll", () => {
		clearTimeout(scrollTimer);
		const hash = location.hash || "#/";
		scrollTimer = setTimeout(() => saveScroll(hash, window.scrollY), 200);
	}, { passive: true });

	// Klik na odkaz v administraci = nová stránka (nahoru); bez kliku jde o Zpět/Vpřed (obnovit posun).
	let clickedLink = false;
	document.addEventListener("click", (event) => {
		const a = event.target.closest && event.target.closest("a[href^='#/']");
		if (!a || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		saveScroll(location.hash || "#/", window.scrollY);
		clickedLink = true;
	}, true);

	window.addEventListener("hashchange", () => {
		const r = routeOf();
		const key = routeKey(r);
		const byClick = clickedLink;
		clickedLink = false;
		// Změna jen nadpisu ve stejném dokumentu: posunout, nepřekreslovat.
		if (r.name === "doc" && key === lastRoute && document.querySelector(".prose")) {
			scrollToHeading(r.heading);
			return;
		}
		const saved = savedScroll()[location.hash || "#/"];
		pendingScroll = !byClick && typeof saved === "number" ? saved : null;
		route();
	});

	// Po návratu do záložky po víc než minutě načíst data znovu (dokumenty se mezitím mohly změnit).
	let hiddenAt = 0;
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			hiddenAt = Date.now();
			return;
		}
		if (hiddenAt && Date.now() - hiddenAt > 60000 && state.session && state.session.authenticated && !document.querySelector(".lightbox")) {
			const typing = document.activeElement && document.activeElement.tagName === "INPUT";
			if (!typing) refresh();
		}
		hiddenAt = 0;
	});

	async function start() {
		if (!window.marked || !window.DOMPurify) {
			clear(app);
			app.append(el("p", { class: "boot" }, "Nepodařilo se načíst knihovny pro zobrazení dokumentů (cdn.jsdelivr.net). Zkontroluj připojení a obnov stránku."));
			return;
		}
		try {
			const response = await fetch("/api/admin/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
			state.session = response.ok ? await response.json() : { configured: true, authenticated: false };
		} catch (e) {
			state.session = { configured: true, authenticated: false };
		}
		const saved = savedScroll()[location.hash || "#/"];
		pendingScroll = typeof saved === "number" ? saved : null;
		route();
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
	else start();
})();
