# №2: порядок масок — граф до правки

21.09.2026. Проверено на `d0822de`: новая production-маска `234234234 (2).webp` имеет самое новое время файла, но `files.js` начинается с `!!! 3 x 2.webp`. Предыдущая правка `images-bsns-ru/f6b5e7f` обслуживает другой каталог и не исправляет этот путь. Работающий каталог картинок не отменяется.

```text
upload.php::listMaskNames <- upload.php::rebuildMaskData, upload.php [admin gallery response]
upload.php::rebuildMaskData <- upload.php::$rebuild [upload/rebuild POST], upload.php::deleteMaskTransactional [callback]
NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames <- NewUI/tools/build-ready-mask-data.mjs [CLI bootstrap]
NewUI/tools/build-ready-mask-data.mjs::writeMaskIndex <- NewUI/tools/build-ready-mask-data.mjs [CLI bootstrap]
NewUI/tools/build-ready-mask-data.mjs::writeMaskDataFile <- NewUI/tools/build-ready-mask-data.mjs [CLI loop]
mask-gallery.js::MaskLibrarySite.open <- mask-gallery.js::MaskLibrarySite.initialize [openMaskLibrary.click]
mask-gallery.js::MaskLibrarySite.loadScript <- mask-gallery.js::MaskLibrarySite.initialize
mask-gallery.js::MaskLibrarySite.item <- mask-gallery.js::MaskLibrarySite.providePage [items.map]
mask-gallery.js::MaskLibrarySite.providePage <- shared BZNResourceLibrary [provider callback]
NewUI/masks/files.js::BZNReadyMaskFiles <- mask-gallery.js::MaskLibrarySite.constructor, design-bzn-ru/NewUI/Canvas_MaskPainter.js::CanvasMaskPainter.readyMaskFileNames
NewUI/masks/data/NNN.js::BZNReadyMaskData <- design-bzn-ru/NewUI/Canvas_MaskPainter.js::CanvasMaskPainter.loadReadyMaskDataUrl
```

Граница: дата файла перед алфавитным tie-break; единая revision списка и числовых data-файлов; обновление индекса при открытии готовых масок. Содержимое исходных масок, сохранение маски в слой, кисти, кропер и библиотека картинок не меняются. Числовые data-файлы обязательно перестраиваются вместе с индексом.

## После правки

```text
upload.php::listMaskNames <- прежние rebuildMaskData и admin gallery; modified DESC, прежний tie-break по имени/размеру
upload.php::rebuildMaskData <- прежние POST handlers; дополнительно CLI --rebuild; публикует BZNReadyMaskRevision вместе с индексом
NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames <- прежний CLI bootstrap; mtime DESC
NewUI/tools/build-ready-mask-data.mjs::writeMaskIndex <- CLI bootstrap после генерации всех payload
mask-gallery.js::MaskLibrarySite.refreshIndex <- MaskLibrarySite.open
mask-gallery.js::MaskLibrarySite.loadScript <- прежний initialize, новый refreshIndex
mask-gallery.js::MaskLibrarySite.item <- прежний providePage; revision в data_script_url
```

Проверено: PHP-функция на изолированных файлах 3/3; настоящий Node-генератор в отдельных временных каталогах 3/3, включая точные имена и байты payload; gateway contract и syntax/diff PASS. CUA Edge: три чистых загрузки localhost с текущим mask-gallery.js, открытие окна и новая карточка первой; дополнительно закрытие/открытие без reload подхватило следующую revision. Ошибок браузера нет. Fixture не загружает маски в production.
