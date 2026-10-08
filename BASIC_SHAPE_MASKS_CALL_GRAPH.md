# 236 — круг и два диагональных овала, граф до реализации

NewUI/tools/build-basic-shape-masks.mjs::BasicShapeMaskSet.source <- StaticMaskSet.records; opaque grayscale SVG white-reveal, круг radius47%, ellipse±45° с внешним отступом около3%.
NewUI/tools/static-mask-set.mjs::StaticMaskSet.write <- basic-shape main CLI; существующий collision guard и ordering timestamp без изменения, прежние ресурсы не переписываются.
NewUI/tools/build-ready-mask-data.mjs::writeMaskDataFile/writeMaskIndex <- CLI; индекс/lazy только из фактического каталога.
upload.php::rebuildMaskData <- production CLI --rebuild после only-new package; существующие статические и загруженные маски сохраняются.
design-bzn-ru/NewUI/Canvas_MaskPainter.js::loadReadyMaskItem/save <- native ready gallery Use/Save; прежний white-reveal import, canvas renderer и кисть не изменяются.
tests/mask-set-browser.mjs::MaskSetChecks.validate/select <- три native прохода circle/oval-left/oval-right; source/stored gray, center visible, corners hidden, small outside margin, native Use/save/reopen в трёх пропорциях.
