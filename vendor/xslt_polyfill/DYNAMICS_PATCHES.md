# Correctifs Dynamics du fork local

Ce dossier est un **fork local** de [mfreed7/xslt_polyfill](https://github.com/mfreed7/xslt_polyfill)
(commit et version dans [UPSTREAM.json](UPSTREAM.json)).

Règles :

- Chaque modification d'un fichier upstream est entourée de marqueurs :
  `// DYN-<nnn> begin: <résumé>` … `// DYN-<nnn> end`.
- Chaque correctif a une entrée ci-dessous (problème, symptôme dans Dynamics, solution, statut).
- Un correctif qui peut vivre **hors** du code upstream (wrapper, options) va dans
  `src/polyfill/` à la racine du projet, pas ici. Ce fichier liste les deux, pour avoir une seule vue.
- Après une resynchro upstream : `npm run vendor:status` pour voir l'écart, puis réappliquer les blocs DYN.

## Correctifs appliqués

| Id | Où | Problème | Solution |
|----|----|----------|----------|
| DYN-000 | `vendor/xslt_polyfill/.gitignore` | Upstream ignore `dist/`, donc la glue emscripten n'est pas versionnée. | `dist/xslt-wasm.js` (copié du paquet npm `xslt-polyfill@1.0.37`) est versionné. Le build n'a pas besoin d'emscripten. |
| DYN-001 | `src/polyfill/prelude.js` | La glue emscripten termine par `define([], …)` (AMD anonyme) si `define.amd` existe. Les pages Dynamics qui chargent RequireJS lèvent alors `Mismatched anonymous define() module`. | Le wrapper déclare `var define, module, exports;` en local : la glue ne voit ni AMD ni CommonJS. |
| DYN-002 | `src/polyfill/prelude.js` | Le loader peut injecter plusieurs fois dans la même fenêtre (règle Enable rejouée à chaque rendu de barre de commande). | Garde `window.__bnzXsltPolyfillLoaded` avant toute exécution. |
| DYN-003 | `src/polyfill/prelude.js` | Les options du polyfill doivent varier selon la fenêtre (rapport SSRS, document XML, page Dynamics). | Options passées par le loader dans `window.bnzXsltPatchPolyfillOptions`, converties en `xsltPolyfillOptions` (mode « embedder » prévu par upstream). |
| DYN-004 | loader (`src/loader/40-polyfill.js`) | Le build single-file encode le wasm en binaire dans une chaîne : il casse si le script est décodé autrement qu'en UTF-8. Les web resources Dynamics ne garantissent pas `charset=utf-8`. | Le loader récupère le source par XHR (décodé UTF-8 par défaut pour du JS) puis l'évalue dans le royaume cible (`win.eval`). Pas de balise `<script src>`. |
| DYN-005 | loader (`src/loader/50-watch.js`), 1.0.0.1 | La Recherche avancée (9.2, depuis settings only) appelle XSLT pendant son chargement et ne charge pas son ribbon : aucune règle Enable ne s'y exécute. | Stub et copie du loader posés sur la `Window` `about:blank` de la popup (réutilisée par la 1re navigation), hook `appendChild`/`insertBefore` pour les iframes, réouverture unique d'une page manquée. |
| DYN-006 | `vendor/xslt_polyfill/src/xslt-polyfill-src.js` (`inlineStylesheetIncludesSync`, appel dans `importStylesheet`), 1.0.0.3 | `fetch_and_load_document` (transform.c) suspend **toujours** via Asyncify, même pour une feuille déjà dans `preprocessedStylesheets`. Tout appel synchrone sur une feuille avec `xsl:include`/`xsl:import` échoue. Supposée cause du ribbon cassé de la Recherche avancée. | À `importStylesheet` : XHR synchrone même origine, puis contenu recopié dans la feuille. `include` : inséré en place. `import` : placé avant les éléments propres, sans les templates nommés ni les variables globales redéfinis, et l'import le plus tardif l'emporte. Les namespaces du fichier inclus sont redéclarés, `exclude-result-prefixes` est fusionné. Rapport dans `window.__bnzXsltInlineReport`. N'était **pas** la cause du ribbon cassé (voir DYN-008). |
| DYN-007 | `src/polyfill/postlude.js`, 1.0.0.3 | Pas de visibilité sur les transformations qui échouent dans une org réelle. | Enveloppe `importStylesheet`/`transformToFragment`/`transformToDocument` : compteur d'appels et 30 dernières erreurs (feuille, source, message) dans `window.__bnzXsltPolyfillLoaded`, plus un `console.warn`. Exposé par `bnz.XsltPatch.report()`. |
| DYN-008 | loader (`src/loader/60-css.js`), 1.0.0.4 | Online 9.2 lie `/_static/css/<lcid>/cui.css` mais ne sert que la copie 1033 : 404 en 1036. Le ribbon legacy de la Recherche avancée sort en texte brut, et `span#ribboninstruction.ms-cui-hidden` affiche `undefined`. | Le balayage repère les `<link rel="stylesheet">` même origine en échec (`cssRules` illisible ou statut ≥ 400) dont l'URL a un segment de langue après `/_static/css/`, et ajoute un lien vers `cssFallbackLcid` (1033). Un lien n'est traité qu'une fois. |
| DYN-009 | `vendor/xslt_polyfill/src/xslt-polyfill-src.js` (`transformToFragment`, branche `application/xml`), 1.0.0.5 | Upstream choisit d'ajouter le namespace XHTML et de mettre les attributs en minuscules selon le type de la **page** (`isXml`), et non selon le document passé à `transformToFragment`. Dynamics (`Mscrm.XslProcessor`) transforme vers le XMLDocument d'entrée, sérialise, puis lit `getNamedItem("optionsXML")` : les valeurs des conditions de groupe d'options d'une vue existante sont toutes jugées supprimées. | Le `contentType` du document de sortie décide (repli sur `isXml` s'il est illisible). Document XML : ni namespace XHTML ni minuscules, comme le XSLT natif. Document HTML : inchangé. |

## Backlog (à confirmer sur une org réelle)

| Id | Sujet | Détail |
|----|-------|--------|
| DYN-101 | `document()` en appel synchrone | Toujours non supporté (erreur `Unknown mime type undefined`, module WASM intact ensuite). Corriger demande de modifier `transform.c`, par exemple un loader C synchrone qui lit d'abord un cache rempli par XHR synchrone, puis de recompiler avec emscripten. Les includes sont couverts par DYN-006. |
| DYN-102 | Documents d'un autre royaume (iframe) | Le code legacy passe souvent un `XMLDocument` créé dans la fenêtre parente à une iframe (et inversement). Vérifier `instanceof HTMLHtmlElement`, `XMLSerializer` et `DOMParser` entre royaumes dans `transformToFragment`. |
| DYN-103 | `transformNode` / `selectNodes` / `selectSingleNode` | API MSXML (IE) encore appelée par certains scripts 8.2 via des shims maison. Identifier si les shims Dynamics s'appuient sur `XSLTProcessor` (alors couvert) ou non. |
| DYN-104 | CSP sans `'wasm-unsafe-eval'` | Online peut envoyer une CSP qui bloque la compilation wasm. `xsltPolyfillReady()` rejette alors : le loader doit le journaliser clairement. |
| DYN-105 | Mode quirks | Les pages ASPX legacy rendent souvent en quirks ; le remplacement de document du polyfill force no-quirks pour du XML transformé. Vérifier le rendu des rapports. |
