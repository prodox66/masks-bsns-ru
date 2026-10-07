# 210 — косые фрагментированные маски, граф до реализации

NewUI/tools/build-geometric-masks.mjs::GeometricMaskSet.records <- GeometricMaskSet.write; browser verifier
NewUI/tools/build-geometric-masks.mjs::GeometricMaskSet.source <- GeometricMaskSet.records
NewUI/tools/build-geometric-masks.mjs::GeometricMaskSet.polygon <- GeometricMaskSet.source [white reveal pieces and black edge cuts]
NewUI/tools/build-geometric-masks.mjs::GeometricMaskSet.write <- main CLI [validate all new paths before writing; existing resources are never overwritten]
NewUI/tools/build-geometric-masks.mjs::main <- direct CLI argument guard [import has no filesystem effects]
NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames <- CLI bootstrap [unchanged mtime DESC; geometry timestamp matches preceding gradient set and prefix001 follows000]
upload.php::rebuildMaskData <- CLI --rebuild [existing lock/atomic numeric payload+index rebuild]
design-bzn-ru/NewUI/Canvas_MaskPainter.js::CanvasMaskPainter.readyMaskImportOptions <- loadReadyMaskItem [published209 metadata reader, no new editor code]
design-bzn-ru/NewUI/Canvas_MaskPainter.js::CanvasMaskPainter.loadReadyMaskItem <- gallery Use callback [existing captured target guards, white reveals]

Граница: только новый config/generator/шесть SVG/верификатор; renderer/кисть/Cropper/старые originals не меняются. Шесть вариантов: ломаный край, параллельные полоски и отдельные сегменты; каждый с зеркальной геометрией. Чёрно-белые SVG кодируют видимость изображения; цвет окружения задаёт фон проекта. Полный белый хвост209 относится к градиентам и сохраняется без изменений.
