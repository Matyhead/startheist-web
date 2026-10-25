// Hush Heist web: videa se načtou a hrají, až když jsou vidět; úvodní video na šířku nebo na výšku,
// navigace, záložky, trailer, hodiny na „kameře“ v úvodu, přepínač jazyka, fáze webu z config.js
// (playtest / již brzy na Steamu, odkaz na Steam a na zpětnou vazbu), sdílení odkazu a údaje
// o nejnovější verzi dema z GitHubu (Windows i Mac, na Macu je Mac hlavní tlačítko).
// Stejný skript pro českou (/) i anglickou (/en) stránku: jazyk pozná z <html lang>.
(() => {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const repo = "Matyhead/startheist-web";
	const czech = document.documentElement.lang === "cs";
	const config = window.HH || {};

	// Česká typografie: jednopísmenné předložky a spojky nezůstanou na konci řádku.
	const glue = (root) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			node.nodeValue = node.nodeValue.replace(/(^|[\s(„])([kvszaiouKVSZAIOU])\s+/g, "$1$2 ");
		}
	};
	if (czech) document.querySelectorAll("p, li, h1, h2, h3, figcaption, summary").forEach(glue);

	// Fáze webu: odkaz na Steam (bez adresy se tlačítka Steamu schovají) a na zpětnou vazbu.
	document.querySelectorAll("[data-steam]").forEach((link) => {
		if (config.steam) {
			link.href = config.steam;
			link.target = "_blank";
			link.rel = "noopener";
		} else if (link.classList.contains("btn")) {
			link.hidden = true;
		}
	});
	if (config.feedback) {
		document.querySelectorAll("[data-feedback]").forEach((link) => {
			link.href = config.feedback;
			link.target = "_blank";
			link.rel = "noopener";
			link.hidden = false;
		});
		document.querySelectorAll("[data-feedback-text]").forEach((el) => (el.hidden = true));
	}

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

	// Úvodní video: na telefonu na výšku verze na výšku. Plakát pod ním je <picture>.
	const hero = document.querySelector(".hero__video");
	if (hero && !reduceMotion) {
		const tall = window.matchMedia("(max-aspect-ratio: 3/4)");
		const load = () => {
			hero.classList.remove("is-playing");
			hero.src = tall.matches ? hero.dataset.tall : hero.dataset.wide;
			const promise = hero.play();
			if (promise) promise.catch(() => {});
		};
		hero.addEventListener("playing", () => hero.classList.add("is-playing"));
		tall.addEventListener("change", load);
		load();
	}

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

	// Trailer: hraje se zvukem po kliknutí; telefon na výšku dostane verzi na výšku.
	const trailer = document.getElementById("trailer");
	if (trailer) {
		const player = trailer.querySelector("video");
		const closeTrailer = () => {
			player.pause();
			trailer.hidden = true;
			document.body.style.overflow = "";
		};
		document.querySelectorAll("[data-trailer]").forEach((button) =>
			button.addEventListener("click", (event) => {
				event.preventDefault();
				const tall = window.matchMedia("(orientation: portrait) and (max-width: 820px)").matches;
				const src = tall ? "/assets/video/trailer_vertical.mp4" : "/assets/video/trailer.mp4";
				trailer.classList.toggle("is-vertical", tall);
				if (player.getAttribute("src") !== src) player.src = src;
				trailer.hidden = false;
				document.body.style.overflow = "hidden";
				player.currentTime = 0;
				player.play().catch(() => {});
				trailer.querySelector("button").focus();
			})
		);
		trailer.addEventListener("click", (event) => {
			if (event.target !== player) closeTrailer();
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !trailer.hidden) closeTrailer();
		});
	}

	// Sdílení odkazu: na telefonu systémové sdílení, jinde zkopírování do schránky.
	const url = "https://startheist.com" + (czech ? "/" : "/en");
	document.querySelectorAll("[data-share]").forEach((button) =>
		button.addEventListener("click", async () => {
			if (navigator.share && navigator.maxTouchPoints > 1) {
				try {
					await navigator.share({ title: "Hush Heist", url });
					return;
				} catch (error) {
					if (error && error.name === "AbortError") return;
				}
			}
			try {
				await navigator.clipboard.writeText(url);
				if (button.dataset.done) {
					const label = button.textContent;
					button.textContent = button.dataset.done;
					setTimeout(() => (button.textContent = label), 2200);
				}
			} catch (error) {
				window.prompt(czech ? "Odkaz na hru:" : "Link to the game:", url);
			}
		})
	);

	// Stažení: na Macu je hlavní tlačítko verze pro Mac (iPad se hlásí jako Mac, ale má dotyk).
	const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
	const onMac = /mac/i.test(platform) && navigator.maxTouchPoints < 2;
	const zip = {
		win: `https://github.com/${repo}/releases/latest/download/HushHeist-demo.zip`,
		mac: `https://github.com/${repo}/releases/latest/download/HushHeist-mac.zip`,
	};
	const mine = onMac ? "mac" : "win";
	const other = onMac ? "win" : "mac";
	document.querySelectorAll("[data-dl]").forEach((link) => {
		link.href = zip[mine];
		const label = link.querySelector("[data-os-label]");
		if (label) label.textContent = label.dataset[mine];
		// Po kliknutí se stahování rozběhne a stránka sjede na návod pro testery.
		link.addEventListener("click", () => setTimeout(() => document.getElementById("navod").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), 350));
	});
	document.querySelectorAll("[data-dl-alt]").forEach((link) => {
		link.href = zip[other];
		link.textContent = link.dataset[other];
	});
	const win = document.getElementById("download-win");
	const mac = document.getElementById("download-mac");
	if (onMac && win && mac) {
		win.classList.replace("btn--gold", "btn--ghost");
		mac.classList.replace("btn--ghost", "btn--gold");
		mac.parentElement.insertBefore(mac, win);
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
				button.querySelector("[data-meta]").textContent = czech ? `verze z ${date}, zip ${size} MB` : `${date} build, zip ${size} MB`;
				button.href = asset.browser_download_url;
			};
			fill(win, "HushHeist-demo.zip");
			fill(mac, "HushHeist-mac.zip");
		})
		.catch(() => {});
})();
