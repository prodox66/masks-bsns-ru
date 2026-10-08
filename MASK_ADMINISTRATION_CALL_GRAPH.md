# 235 — администратор масок, граф до изменения

design-bzn-ru/mask-gallery-admin.php::BznMaskGalleryAdminEndpoint.run <- HTTP status/POST upload/delete/order; WordPress grantedImageGalleryAdmin (administrator-only) и отдельный nonce до чтения/записи масок.
resource-admin/MaskAdministration.php::BznMaskAdministration.__construct <- host endpoint.owner; CLI contracts; loads only configured owner root, never request storage paths.
resource-admin/MaskAdministration.php::BznMaskAdministration.legacyConfiguration <- __construct/limits; include-only upload helpers and MIME/batch settings cached once per request.
resource-admin/MaskAdministration.php::BznMaskAdministration.limits <- host endpoint.run GET status; actual existing PHP upload batch size.
resource-admin/MaskAdministration.php::BznMaskAdministration.perform <- host endpoint.run POST; admin mutation lock surrounds the selected dispatch.
resource-admin/MaskAdministration.php::BznMaskAdministration.selected <- perform; SHA256 matched against current real basenames.
resource-admin/MaskAdministration.php::BznMaskAdministration.names <- selected/move; actual listMaskNames owner.
resource-admin/MaskAdministration.php::BznMaskAdministration.upload <- perform; original validated HTTP uploads, archive only new request files if rebuilding fails.
resource-admin/MaskAdministration.php::BznMaskAdministration.remove <- perform; one recoverable copy before transactional deletion.
resource-admin/MaskAdministration.php::BznMaskAdministration.move <- perform; only separate order metadata changes.
resource-admin/MaskAdministration.php::BznMaskAdministration.archive <- upload error/remove; selected basename only, private directory0700/file0600.
resource-admin/MaskAdministration.php::BznMaskAdministration.rebuild <- upload/remove callback/move; original atomic catalog publication.
upload.php::uploadMasks <- legacy upload page; BznMaskAdministration.upload; existing HTTP-upload/name checks retained.
upload.php::deleteMaskTransactional <- legacy upload page; BznMaskAdministration.remove; existing backup/restore-on-failure retained.
upload.php::rebuildMaskData <- legacy upload page/CLI; BznMaskAdministration.rebuild; existing generated index/data owner.
resource-admin/MaskOrder.php::BznMaskOrder.__construct <- listMaskNames/BznMaskAdministration.move; one canonical catalog config.
resource-admin/MaskOrder.php::BznMaskOrder.ordered <- listMaskNames; unknown new uploads keep default order before manually ranked resources.
resource-admin/MaskOrder.php::BznMaskOrder.save <- BznMaskAdministration.move; validated basenames saved atomically, source bytes/timestamps untouched.
upload.php::listMaskNames <- rebuildMaskData, upload page, BznMaskAdministration.names; default newest-first сохраняется при отсутствии ручного порядка.
NewUI/tools/build-ready-mask-data.mjs::discoveredMaskNames <- CLI; читает тот же manual-order контракт после прежней сортировки.
design-bzn-ru/NewUI/Canvas_MaskPainter.js::MaskLibraryAdministration.actions <- openReadyMaskGallery; server status разрешает UI actions только авторизованному администратору.
design-bzn-ru/assets/resource-library-v2.js::runAdminAction <- existing native upload button/context menu; order command доступна только caller с callback, picture actions не меняются.

Аудит: shared images Resource Engine на production имеет только resources->images directory; он не является владельцем готовых masks. Поэтому не посылать туда удаление/порядок масок. Existing masks upload.php является владельцем физического каталога и generated index/data. Include-only guard отключает только endpoint dispatch при использовании из нового защищённого шлюза.
