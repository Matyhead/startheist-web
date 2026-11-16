# startheist.com

Web hry **Hush Heist**: popis hry, videa ze hry a stažení dema pro Windows a Mac.

Statická stránka bez build kroku (`styles.css`, `main.js`, média v `assets/`), ve dvou jazycích:

- `index.html` je česká verze (`/`),
- `en/index.html` je anglická verze (`/en`).

Obě stránky mají stejnou strukturu, stejné třídy a sdílí `styles.css`, `main.js` i média, takže
**změna obsahu se dělá v obou souborech**. Kde je ve hře vidět text (plán loupeže, noviny,
počítač ochranky, nástěnka v hospodě, šéfův obchod...), má anglická stránka vlastní snímek
s příponou `_en` (`news_en.mp4`, `ui_planning_en.jpg` atd.), natočený ze hry v angličtině.

Jazyk: kořen `/` má v `<head>` krátký skript, který prohlížeč bez češtiny a slovenštiny
v `navigator.languages` přesměruje na `/en`. Přepínač EN/CZ v liště (a odkaz v patičce)
si volbu uloží do `localStorage` (`hh-lang`) a ta má přednost. Roboti se nepřesměrovávají,
obě verze se navzájem odkazují přes `hreflang` (`x-default` je angličtina).

Vercel ji servíruje tak, jak je (nastavení v `vercel.json`).

## Fáze webu: playtest, nebo Již brzy na Steamu

Jediné místo je `config.js` (načítá ho `<head>` obou stránek):

- `phase: "playtest"`: odznak INTERNÍ PLAYTEST, hlavní tlačítko Stáhnout demo (playtest), návod pro testery.
- `phase: "soon"`: odznak JIŽ BRZY NA STEAMU, hlavní tlačítko Přidat do přání (Steam), demo zůstane
  ke stažení jako vedlejší možnost. Do `steam` patří adresa stránky hry na Steamu, bez ní se tlačítka
  Steamu schovají.
- `feedback`: odkaz pro zpětnou vazbu (Discord, formulář). Prázdný = text „napiš tomu, kdo tě pozval“.

V HTML se obsah pro jednotlivé fáze označuje třídami `if-playtest` a `if-soon`.
- `press`, `discord`: e-mail pro média a pozvánka na Discord pro media kit `/press`. Prázdné = řádky
  s kontaktem se v media kitu schovají (`press.js`, atribut `data-need`).

## Media kit `/press`

Stránka pro novináře a tvůrce (`press/index.html`, `press.css`, `press.js`, soubory v `assets/press/`,
balík `assets/press/hush-heist-presskit.zip`). Po změně textů v `assets/press/` přebalit ZIP:

```bash
cd assets/press && rm hush-heist-presskit.zip && zip -X -r hush-heist-presskit.zip README.txt fact_sheet.txt logo keyart screenshots
```

## Administrace `/admin`

Soukromý přehled projektu pro majitele (plán, rozhodnutí, dokumenty, balíčky assetů), přihlášení heslem.
Tohle repo je veřejné, proto obsah administrace **není tady**: stránka (`admin/`) je jen zobrazení
a funkce Vercelu v `api/admin/` čtou soukromé repo hry přes GitHub API. Bez proměnných prostředí
administrace nic neukáže.

Proměnné (Vercel › Settings › Environment Variables, Production, pak Redeploy):

| Proměnná | Hodnota |
|---|---|
| `ADMIN_PASSWORD` | heslo aspoň 20 znaků, vygenerované (`openssl rand -base64 24`) a uložené ve správci hesel |
| `ADMIN_SECRET` | náhodný řetězec aspoň 32 znaků (`openssl rand -hex 32`) |
| `GITHUB_TOKEN` | fine-grained token jen pro čtení repa hry (Contents a Metadata: Read-only) |
| `GITHUB_REPO`, `GITHUB_BRANCH` | volitelné (výchozí repo hry a `main`) |

Přihlášení je podepsaná cookie na 30 dní, změna hesla nebo `ADMIN_SECRET` odhlásí všechna zařízení.
Číst jde jen `docs/**` (markdown, JSON, obrázky) a `CLAUDE.md` repa hry a releasy se štítkem `assets-*`.

## Stažení dema

Tlačítka na webu vedou na nejnovější release tohoto repa:

- Windows: `https://github.com/Matyhead/startheist-web/releases/latest/download/HushHeist-demo.zip`
- Mac: `https://github.com/Matyhead/startheist-web/releases/latest/download/HushHeist-mac.zip`

Datum a velikost obou verzí si web načte z GitHub API. Na Macu je hlavní (zlaté) tlačítko
verze pro Mac.

Nová verze se vydá z repa hry skriptem `tools/publish_demo.sh` (export pro Windows i Mac
a nový release s oběma zipy). Web se kvůli tomu měnit nemusí.

## Videa

Videa a obrázky jsou natočené přímo ze hry (Godot, skriptované záběry v `tools/record_web.gd`
v repu hry, s `--lang=en|cs`) a převedené na H.264 MP4 (ffmpeg, libx264, bez zvuku). Videa se
načítají a hrají, až když jsou na obrazovce. Úvodní video je ve dvou verzích: `hero.mp4` na šířku
a `hero_tall.mp4` na výšku pro telefony (skript vybere podle poměru stran, plakát je `<picture>`).
Hero, `talk`, `stairs`, `stun` a `museum` jsou sestříhané ze záběrů traileru (`tools/record_trailer.gd`),
`carry` a `stretch` z `record_web.gd`. Zmenšené snímky do sekcí jsou v `assets/img/sm/`.
Změněný soubor se stejným jménem dostane v HTML `?v=...`, protože `/assets` se cachuje týden.

## Lokální náhled

```bash
python3 -m http.server 8765 --directory .
```

Česká verze je na `http://localhost:8765/` (prohlížeč bez češtiny přesměruje na `/en/`),
anglická na `http://localhost:8765/en/`.
