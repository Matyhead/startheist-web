// Hush Heist web: videa se načtou a hrají, až když jsou vidět; navigace, záložky,
// galerie, hodiny na „kameře“ v úvodu, přepínač jazyka a údaje o nejnovější verzi dema
// z GitHubu (Windows i Mac, na Macu je Mac hlavní tlačítko). Stejný skript pro českou
// (/) i anglickou (/en) stránku: jazyk pozná z <html lang>.
(() => {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const repo = "Matyhead/startheist-web";
	const czech = document.documentElement.lang === "cs";

	// Česká typografie: jednopísmenné předložky a spojky nezůstanou na konci řádku.
	const glue = (root) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			node.nodeValue = node.nodeValue.replace(/(^|[\s(„])([kvszaiouKVSZAIOU])\s+/g, "$1$2 ");
		}
	};
	if (czech) document.querySelectorAll("p, li, h1, h2, h3, figcaption, summary").forEach(glue);

	// Přepínač jazyka: volbu si zapamatuje (kořen webu podle ní přesměruje, viz <head>).
	document.querySelectorAll("[data-lang]").forEach((link) =>
		link.addEventListener("click", () => {
			try {
				localStorage.setItem("hh-lang", link.dataset.lang);
			} catch (error) {}
		})
	);

	// Navigace: pozadí po odscrollování, mobilní menu.
	const nav = document.getElementById("nav");
	const toggle = document.getElementById("nav-toggle");
	const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
	onScroll();
	window.addEventListener("scroll", onScroll, { passive: true });
	toggle.addEventListener("click", () => {
		const open = nav.classList.toggle("is-open");
		toggle.setAttribute("aria-expanded", String(open));
	});
	document.querySelectorAll("#nav-links a").forEach((link) =>
		link.addEventListener("click", () => {
			nav.classList.remove("is-open");
			toggle.setAttribute("aria-expanded", "false");
		})
	);

	// Objevení sekcí při scrollu.
	const revealer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.add("is-visible");
					revealer.unobserve(entry.target);
				}
			}
		},
		{ rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
	);
	document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

	// Videa: zdroj až při přiblížení, přehrávat jen viditelná (šetří data i baterku).
	const play = (video) => {
		if (!video.src && video.dataset.src) {
			video.src = video.dataset.src;
		}
		const promise = video.play();
		if (promise) promise.catch(() => {});
	};
	const videos = document.querySelectorAll("video[data-src]");
	// Plakátky (náhledy videí) až kousek před tím, než na ně uživatel doscrolluje.
	const posters = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && entry.target.dataset.poster) {
					entry.target.poster = entry.target.dataset.poster;
					posters.unobserve(entry.target);
				}
			}
		},
		{ rootMargin: "900px 0px" }
	);
	videos.forEach((video) => posters.observe(video));
	if (reduceMotion) {
		// Omezené animace: videa se pustí až najetím nebo klepnutím.
		videos.forEach((video) => {
			const parent = video.parentElement;
			parent.addEventListener("mouseenter", () => play(video));
			parent.addEventListener("mouseleave", () => video.pause());
			parent.addEventListener("click", () => (video.paused ? play(video) : video.pause()));
		});
		const hero = document.querySelector(".hero__video");
		if (hero) hero.pause();
	} else {
		const watcher = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) play(entry.target);
					else entry.target.pause();
				}
			},
			{ rootMargin: "150px 0px", threshold: 0.2 }
		);
		videos.forEach((video) => watcher.observe(video));
	}
	// Nástroje: najetí myší pustí záznam od začátku.
	document.querySelectorAll(".tool").forEach((tool) => {
		const video = tool.querySelector("video");
		tool.addEventListener("mouseenter", () => {
			if (video.src) video.currentTime = 0;
			play(video);
		});
	});

	// Hodiny na záznamu v úvodu (běží od 23:47:12 jako noc v obchodě).
	const clock = document.querySelector("[data-clock]");
	if (clock) {
		const start = Date.now();
		const tick = () => {
			const total = 23 * 3600 + 47 * 60 + 12 + Math.floor((Date.now() - start) / 1000);
			const h = Math.floor(total / 3600) % 24;
			const m = Math.floor(total / 60) % 60;
			const s = total % 60;
			clock.textContent = `${czech ? "STŘEDA" : "WED"} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
		};
		tick();
		setInterval(tick, 1000);
	}

	// Záložky ovládání.
	const tabs = document.querySelectorAll("[role=tab]");
	tabs.forEach((tab) =>
		tab.addEventListener("click", () => {
			tabs.forEach((other) => {
				const selected = other === tab;
				other.setAttribute("aria-selected", String(selected));
				document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
			});
		})
	);

	// Galerie: obrázek přes celou obrazovku.
	const box = document.getElementById("lightbox");
	const boxImage = box.querySelector("img");
	const closeBox = () => {
		box.hidden = true;
		document.body.style.overflow = "";
	};
	document.querySelectorAll(".shot").forEach((shot) =>
		shot.addEventListener("click", () => {
			boxImage.src = shot.dataset.full;
			boxImage.alt = shot.querySelector("img").alt;
			box.hidden = false;
			document.body.style.overflow = "hidden";
			box.querySelector("button").focus();
		})
	);
	box.addEventListener("click", (event) => {
		if (event.target !== boxImage) closeBox();
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !box.hidden) closeBox();
	});

	// Stažení: na Macu je hlavní tlačítko verze pro Mac (iPad se hlásí jako Mac, ale má dotyk).
	const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
	const onMac = /mac/i.test(platform) && navigator.maxTouchPoints < 2;
	const win = document.getElementById("download-win");
	const mac = document.getElementById("download-mac");
	if (onMac && win && mac) {
		win.classList.replace("btn--gold", "btn--ghost");
		mac.classList.replace("btn--ghost", "btn--gold");
		mac.parentElement.insertBefore(mac, win);
		document.querySelectorAll("[data-mac-label]").forEach((el) => (el.textContent = el.dataset.macLabel));
	}

	// Nejnovější verze dema (GitHub Releases): datum a velikost pod tlačítky.
	fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
		.then((response) => (response.ok ? response.json() : null))
		.then((release) => {
			if (!release) return;
			const date = new Date(release.published_at).toLocaleDateString(czech ? "cs-CZ" : "en-US", czech ? { day: "numeric", month: "numeric", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
			const fill = (button, name) => {
				const asset = (release.assets || []).find((item) => item.name === name);
				if (!button || !asset) return;
				const size = Math.round(asset.size / 1048576);
				button.querySelector("[data-meta]").textContent = czech ? `verze z ${date} · .zip, ${size} MB` : `${date} build · .zip, ${size} MB`;
				button.href = asset.browser_download_url;
			};
			fill(win, "HushHeist-demo.zip");
			fill(mac, "HushHeist-mac.zip");
		})
		.catch(() => {});
})();
