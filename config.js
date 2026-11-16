// Hush Heist web: jediné místo, kde se přepíná fáze webu (platí pro / i /en).
//   phase: "playtest" = interní playtest: hlavní tlačítko stáhne demo, odznak INTERNÍ PLAYTEST.
//          "soon"     = Již brzy na Steamu: hlavní tlačítko vede na Steam (seznam přání),
//                       demo zůstane ke stažení jako vedlejší možnost.
//   steam:    adresa stránky hry na Steamu (pro "soon"). Prázdná = tlačítka Steamu se schovají.
//   feedback: odkaz pro zpětnou vazbu (Discord, formulář...). Prázdný = „napiš tomu, kdo tě pozval“.
//   press:    e-mail pro média (media kit /press). Prázdný = kontakt na e-mail se v media kitu schová.
//   discord:  pozvánka na Discord (media kit /press). Prázdná = řádek se schová.
window.HH = {
	phase: "playtest",
	steam: "",
	feedback: "",
	press: "",
	discord: "",
};
document.documentElement.dataset.phase = window.HH.phase;
