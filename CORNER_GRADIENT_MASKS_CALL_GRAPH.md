# 212 — отдельные угловые градиенты, до кода

## 225 — повторная прямая команда, граф до правки
NewUI/tools/build-corner-gradient-masks.mjs::CornerGradientMaskSet.source <- GradientMaskSet.records; единая квадратичная линия от почти угла к почти углу, без прежних прямых боковых отрезков.
NewUI/tools/build-corner-gradient-masks.mjs::CornerGradientMaskSet.write <- main CLI; batch SHA guard по предыдущему manifest, backup только изменяемых12 ресурсов вне каталога, затем прежний writer и timestamps.
NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.write <- CornerGradientMaskSet.write, main CLI; исходник родительского writer не менять.
NewUI/tools/build-ready-mask-data.mjs::writeMaskDataFile/writeMaskIndex <- CLI; производные копии этих ресурсов, остальные источники не менять.
upload.php::rebuildMaskData <- CLI --rebuild, прежние callbacks; production rebuild после проверенного обновления12 файлов.
tests/mask-corners-browser.mjs::CornerChecks.pixels/choose <- source/stored, native gallery Use; проверить обе полные стороны и углы при square/wide/tall, black area>=25%, white corner>=20%.

Прямая команда пользователя «те оставь» сохраняет все194 прежних оригинала. Примеры: верх/лево видны, противоположные право/низ плавно исчезают. Добавляем четыре ориентации × прямой/вогнутый/выгнутый; opaque grayscale, black25% каждого скрываемого края, white25% угловой области. Это отдельные имена; прежние18 gradients и6geometry не меняются.

NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.records <- GradientMaskSet.write; новый CornerGradientMaskSet наследует naming/cross-product и вызывает свой source.
NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.number/xml/write <- GradientMaskSet.source/write; новый CornerGradientMaskSet использует те же утилиты и writer после batch collision guard.
NewUI/tools/build-corner-gradient-masks.mjs::CornerGradientMaskSet.source <- inherited GradientMaskSet.records; nested opaque luminance contours вокруг white corner.
NewUI/tools/build-corner-gradient-masks.mjs::CornerGradientMaskSet.write <- main CLI; сначала проверить все12имён, потом existing parent writer только своих файлов.
NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames/writeMaskDataFile <- CLI; local index rebuild, mtimes DESC.
upload.php::listMaskNames/rebuildMaskData <- CLI --rebuild, Resource Engine callbacks; production rebuild после only-new extraction, старые index/data сохраняются в backup внеwebroot.
mask-gallery.js::MaskLibrarySite.providePage <- ResourceLibrary provider; первые18 прежних gradients, затем12 corner на той же странице; прежние6 geometry доступны на следующей, относительный порядок всех прежних сохраняется.
design-bzn-ru/NewUI/Canvas_MaskPainter.js::loadReadyMaskItem/readyMaskImportOptions/loadFile <- native gallery Use; existing white-reveal metadata сохраняет grayscale, no editor runtime change.

Проверка: все12 RGB=R=G=B, alpha255; полный black при normalized x≥.75 OR y≥.75; полный white x≤.25 AND y≤.25; независимые native raster samples кривизны/mirror;3clean gallery Use/save/reopen cycles. Guard сравнивает SHA256/size/mtime всех194previous originals иsource/lazy каждого12new. Старые маски остаются byte-identical.
ПОСЛЕ: subclass/records/source/write реализованы; parent utility owners retained. Corner3×12native +Geom3×6native PASS; exact black25%ORbands/white25%ANDcorner, mirrored raster, three curves and saved-reopened grayscale checked. Existing194production originals guarded before extraction; generated index/data always rebuilt server-side.
