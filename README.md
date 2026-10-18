# startheist.com

Web hry **Hush Heist**: popis hry, videa ze hry a stažení dema pro Windows.

Statická stránka bez build kroku (`index.html`, `styles.css`, `main.js`, média v `assets/`).
Vercel ji servíruje tak, jak je (nastavení v `vercel.json`).

## Stažení dema

Tlačítko na webu vede na nejnovější release tohoto repa:
`https://github.com/Matyhead/startheist-web/releases/latest/download/HushHeist-demo.zip`.
Datum a velikost verze si web načte z GitHub API.

Nová verze se vydá z repa hry skriptem `tools/publish_demo.sh` (export pro Windows
a nový release s `HushHeist-demo.zip`). Web se kvůli tomu měnit nemusí.

## Videa

Videa a obrázky jsou natočené přímo ze hry (Godot, skriptované záběry) a převedené
na H.264 MP4. Videa se načítají a hrají, až když jsou na obrazovce.

## Lokální náhled

```bash
python3 -m http.server 8765 --directory .
```
