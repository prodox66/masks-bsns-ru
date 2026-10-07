# 209 — первые градиентные маски, граф перед добавлением

NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames <- CLI bootstrap [существующий mtime DESC; новые ресурсы получают одно время и числовой порядок]
NewUI/tools/build-ready-mask-data.mjs::writeMaskDataFile <- CLI loop [точные исходные SVG bytes в lazy data]
upload.php::listMaskNames <- rebuildMaskData; admin gallery [production-каталог содержит больше ресурсов, чем stale local]
upload.php::rebuildMaskData <- CLI --rebuild; прежние upload/delete [штатная транзакционная перестройка data+index после добавления только новых файлов]
mask-gallery.js::MaskLibrarySite.providePage <- shared ResourceLibrary provider callback
design-bzn-ru/NewUI/Canvas_MaskPainter.js::CanvasMaskPainter.loadReadyMaskItem <- gallery Use onSelect callback
design-bzn-ru/NewUI/Canvas_MaskPainter.js::normalizeRasterMaskToLuminanceFile <- loadFile [имеющаяся прозрачность выбирает alpha→opaque grayscale, без inversion старых opaque масок]

Новый отдельный generator/config: шесть направлений × прямой/вогнутый/выгнутый,18SVG. Квадратичные opaque grayscale контуры задают настоящую кривизну границы. Белый край22% направления, минимум20% с учётом raster boundary. Editor209 изменяет только чтение явно маркированной полярности; кисть/кропер/генератор прежнего каталога не меняются.

Production: сохранить действующий index/data и список исходников; проверить отсутствие совпадений новых имён; добавить только18новыхSVG; штатный PHP--rebuild. Старые source masks не заменять локальным каталогом. После index совпадения и byte check —3actual browser gallery/import cycles.

NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.records <- GradientMaskSet.write; browser verifier
NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.source <- GradientMaskSet.records
NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.matrix <- GradientMaskSet.source
NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.boundary <- GradientMaskSet.source
NewUI/tools/build-gradient-masks.mjs::GradientMaskSet.write <- main CLI bootstrap [прежние файлы других имён не записываются]
NewUI/tools/build-gradient-masks.mjs::main <- direct CLI argument guard; import класса не запускает генерацию

Визуальная QA: начальный локальный alphaSVG оказался белым на белой gallery подложке и не публиковался. Final source —opaque grayscale SVG с marker white-reveal в bounded prefix. В editor209 readyMaskImportOptions сохраняет RGB только для marker; readyMaskRequestIsCurrent проверяет captured identity до/после нового async чтения и normalization. У прежних файлов нет marker, прежнее inversion сохраняется.
