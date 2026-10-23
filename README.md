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
v repu hry, s `--lang=en|cs`) a převedené na H.264 MP4. Videa se načítají a hrají, až když
jsou na obrazovce.

## Lokální náhled

```bash
python3 -m http.server 8765 --directory .
```

Česká verze je na `http://localhost:8765/` (prohlížeč bez češtiny přesměruje na `/en/`),
anglická na `http://localhost:8765/en/`.
