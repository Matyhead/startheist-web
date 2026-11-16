// Media kit: kontakty, které ještě nejsou (e-mail pro média, Steam, Discord), se neukazují.
// Hodnoty se vyplňují jen v config.js (press, steam, discord); prvky s data-need se pak ukážou samy
// a náhradní texty s data-missing zmizí.
(() => {
	const hh = window.HH || {};
	const values = { press: hh.press || "", steam: hh.steam || "", discord: hh.discord || "" };
	const href = (key, value) => (key === "press" ? "mailto:" + value : value);
	const label = (key, value) => (key === "press" ? value : value.replace(/^https?:\/\//, "").replace(/\/$/, ""));
	const run = () => {
		for (const node of document.querySelectorAll("[data-fill]")) {
			const key = node.getAttribute("data-fill");
			const value = values[key];
			if (!value) continue;
			node.setAttribute("href", href(key, value));
			node.textContent = label(key, value);
		}
		for (const node of document.querySelectorAll("[data-need]")) {
			if (values[node.getAttribute("data-need")]) node.setAttribute("data-ready", "");
		}
		// Náhradní text „přibude se stránkou na Steamu“ zmizí, jakmile je hodnota vyplněná.
		for (const node of document.querySelectorAll("[data-missing]")) {
			if (values[node.getAttribute("data-missing")]) node.setAttribute("data-ready", "");
		}
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
	else run();
})();
