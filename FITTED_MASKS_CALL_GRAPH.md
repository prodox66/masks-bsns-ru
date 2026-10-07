# 227 — точные ресурсы, граф перед реализацией

NewUI/tools/build-fitted-masks.mjs::FittedMaskSet.source <- StaticMaskSet.records; embedded original SHA-проверен, crop только пустых полей, alpha или inverted luminance в opaque grayscale, выход512square с3%black margin.
NewUI/tools/static-mask-set.mjs::StaticMaskSet.records/write <- FittedMaskSet CLI; batch collision guard всех имён до записи, общая timestamp first gradient; существующие PNG/WebP не заменяются.
NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames/writeMaskDataFile/writeMaskIndex <- CLI; производные lazy иindex после новых SVG.
upload.php::rebuildMaskData <- CLI --rebuild; production buildcatalog, sourceSHA/size/mtime всех206 прежних сохраняются.
design-bzn-ru/NewUI/Canvas_MaskPainter.js::readyMaskImportOptions/loadReadyMaskItem/loadFile/save <- existing native gallery onSelect; marker white-reveal сохраняет положительную маску, кисть/editor primitives не менять.
tests/mask-set-browser.mjs::MaskSetChecks.choose <- three clean cycles; native gallery paging/Use/save/reopen, source/lazy/stored RGB, black outer margin, changed silhouette vs original. Прямые внешние потребители SVG — ready library иfile-mode; других вызывающих не найдены.

Точные6letterbox PNGaliases установлены по production originals иnative raster bounds: a7500594,c2bc874e,f679f370,1c558af6,64dc33c5,a97210eb. User screenshots совпадают. Дополнительно ba9d8897 roundedrectangle и6named brush masks с измеренными широкими полями. Dense Rectangular20..1 остаются прежними.
