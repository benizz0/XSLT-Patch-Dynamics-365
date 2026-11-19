# CLAUDE.md

Les règles communes à tous les agents sont dans AGENTS.md. Elles s'appliquent entièrement :

@AGENTS.md

## Spécifique à Claude Code

- Avant de toucher au loader, lire `src/loader/50-watch.js` et `90-ribbon.js` en entier.
  Le flux bootstrap → processWindow → patchDocument → stub/eager n'est lisible qu'en entier.
- Vérifier un comportement en navigateur avec `npm test` (headless). Ne pas conclure qu'un
  changement marche sur la seule base d'un `npm run check`.
- Pour comprendre une réaction d'upstream, chercher dans
  `vendor/xslt_polyfill/src/xslt-polyfill-src.js`. Points d'entrée utiles :
  `embedderOptions`, `isNativeXsltSupported`, `class XSLTProcessor`, `loadWasmModule`.
  Le fichier fait environ 1 300 lignes : lire des plages, pas le fichier entier.
- Ne jamais lire `vendor/xslt_polyfill/dist/xslt-wasm.js` ni
  `build/webresources/bnz_/xsltpatch/xslt-polyfill.js` : 1,3 Mo, une ligne, wasm encodé.
  Utiliser `grep -o` avec un motif court si besoin.
- Les fichiers de `tmp/` et `solution/reference/` sont des exports Dynamics bruts : servent à
  comparer, jamais à générer.
- Chaque version livrée a une entrée datée dans `CHANGELOG.md` ; les clés de configuration
  renommées y sont listées (une ancienne clé dans `localStorage` est ignorée sans erreur).
- Un nouveau correctif Dynamics implique une entrée dans
  `vendor/xslt_polyfill/DYNAMICS_PATCHES.md` et, quand c'est testable sans org, un cas
  dans `test/harness/harness.js` (fonction `autotest`).
