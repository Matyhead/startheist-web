// Hush Heist web: jediné místo, kde se přepíná fáze webu (platí pro / i /en).
//   phase: "playtest" = interní playtest: hlavní tlačítko stáhne demo, odznak INTERNÍ PLAYTEST.
//          "soon"     = Již brzy na Steamu: hlavní tlačítko vede na Steam (seznam přání),
//                       demo zůstane ke stažení jako vedlejší možnost.
//   steam:    adresa stránky hry na Steamu (pro "soon"). Prázdná = tlačítka Steamu se schovají.
//   feedback: odkaz pro zpětnou vazbu (Discord, formulář...). Prázdný = „napiš tomu, kdo tě pozval“.
window.HH = {
	phase: "playtest",
	steam: "",
	feedback: "",
};
document.documentElement.dataset.phase = window.HH.phase;
