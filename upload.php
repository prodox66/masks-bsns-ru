<?php
// BZN Masks admin: upload, gallery, delete and rebuild generated JS payloads.
// Authorization placeholder: password-only (mask_admin), without username/session.
// Place this file in the root of masks.bsns.ru next to index.html and runtime-config.js.

declare(strict_types=1);

// No PHP session/cookie/header dependency is used here.
// Authentication is password-only. The password is carried in POST forms/API requests.
// CORS for static mask resources is handled by the site's .htaccess.

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const MASK_ADMIN_PASSWORD = 'mask_admin';
const MAX_UPLOAD_FILES = 50;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const FILES_GLOBAL_KEY = 'BZNReadyMaskFiles';
const DATA_GLOBAL_KEY = 'BZNReadyMaskData';

$rootDirectory = __DIR__;
$maskDirectory = $rootDirectory . DIRECTORY_SEPARATOR . 'NewUI' . DIRECTORY_SEPARATOR . 'masks';
$dataDirectory = $maskDirectory . DIRECTORY_SEPARATOR . 'data';
$indexFile = $maskDirectory . DIRECTORY_SEPARATOR . 'files.js';
$lockFile = $maskDirectory . DIRECTORY_SEPARATOR . '.rebuild.lock';

$supportedMimeByExtension = [
    'avif' => 'image/avif',
    'gif' => 'image/gif',
    'jpeg' => 'image/jpeg',
    'jpg' => 'image/jpeg',
    'png' => 'image/png',
    'svg' => 'image/svg+xml',
    'webp' => 'image/webp',
];

// PHP rejects a request before this script starts if it contains more files than max_file_uploads.
// The browser uploader below therefore sends selected files in safe batches.
$phpMaxFileUploads = max(1, (int) ini_get('max_file_uploads'));
$uploadBatchSize = max(1, min(10, $phpMaxFileUploads));

// Authorization placeholder requested for the current stage: password only, no username.
function maskAdminAuthorized(string $password): bool
{
    return hash_equals(MASK_ADMIN_PASSWORD, $password);
}

function requestPassword(): string
{
    if (isset($_POST['password']) && is_string($_POST['password'])) {
        return $_POST['password'];
    }

    if (!empty($_SERVER['HTTP_X_MASK_PASSWORD'])) {
        return (string) $_SERVER['HTTP_X_MASK_PASSWORD'];
    }

    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $match)) {
        return trim($match[1]);
    }

    return '';
}

function wantsJson(): bool
{
    if (isset($_POST['format']) && $_POST['format'] === 'json') {
        return true;
    }

    $accept = strtolower((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
    return strpos($accept, 'application/json') !== false;
}

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function escapeHtml(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function jsonForJs($value, int $extraFlags = 0): string
{
    $json = json_encode(
        $value,
        JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES
        | JSON_HEX_TAG
        | JSON_HEX_AMP
        | JSON_HEX_APOS
        | JSON_HEX_QUOT
        | $extraFlags
    );

    if ($json === false) {
        throw new RuntimeException('Не удалось сериализовать данные в JSON.');
    }

    return $json;
}

function ensureDirectory(string $directory): void
{
    if (is_dir($directory)) {
        return;
    }

    if (!mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('Не удалось создать каталог: ' . $directory);
    }
}

function removeDirectoryRecursive(string $directory): void
{
    if (!is_dir($directory)) {
        return;
    }

    $iterator = new FilesystemIterator($directory, FilesystemIterator::SKIP_DOTS);
    foreach ($iterator as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            removeDirectoryRecursive($entry->getPathname());
        } else {
            @unlink($entry->getPathname());
        }
    }

    @rmdir($directory);
}

function listMaskNames(string $maskDirectory, array $supportedMimeByExtension): array
{
    if (!is_dir($maskDirectory)) {
        throw new RuntimeException('Каталог масок не найден: ' . $maskDirectory);
    }

    $names = [];
    $sizes = [];

    foreach (new DirectoryIterator($maskDirectory) as $entry) {
        if (!$entry->isFile()) {
            continue;
        }

        $name = $entry->getFilename();
        $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));

        if (isset($supportedMimeByExtension[$extension])) {
            $names[] = $name;
            $sizes[$name] = $entry->getSize();
        }
    }

    // Sort by file name first; when names compare as equal, use file size from small to large.
    // Try to stay close to Node localeCompare('ru', { numeric: true, sensitivity: 'base' }).
    if (class_exists('Collator')) {
        $collator = new Collator('ru_RU');
        $collator->setAttribute(Collator::NUMERIC_COLLATION, Collator::ON);
        $collator->setStrength(Collator::PRIMARY);

        usort($names, static function (string $left, string $right) use ($collator, $sizes): int {
            $comparison = $collator->compare($left, $right);

            if ($comparison !== false && $comparison !== 0) {
                return $comparison;
            }

            $sizeComparison = ($sizes[$left] ?? 0) <=> ($sizes[$right] ?? 0);

            return $sizeComparison !== 0
                ? $sizeComparison
                : strcmp($left, $right);
        });
    } else {
        usort($names, static function (string $left, string $right) use ($sizes): int {
            $comparison = strnatcasecmp($left, $right);

            if ($comparison !== 0) {
                return $comparison;
            }

            $sizeComparison = ($sizes[$left] ?? 0) <=> ($sizes[$right] ?? 0);

            return $sizeComparison !== 0
                ? $sizeComparison
                : strcmp($left, $right);
        });
    }

    return $names;
}

function atomicWrite(string $targetFile, string $contents): void
{
    $directory = dirname($targetFile);
    ensureDirectory($directory);

    $temporaryFile = tempnam($directory, '.bzn-write-');
    if ($temporaryFile === false) {
        throw new RuntimeException('Не удалось создать временный файл в ' . $directory);
    }

    try {
        if (file_put_contents($temporaryFile, $contents, LOCK_EX) === false) {
            throw new RuntimeException('Не удалось записать файл: ' . $targetFile);
        }

        @chmod($temporaryFile, 0644);
        if (!@rename($temporaryFile, $targetFile)) {
            @unlink($targetFile);
            if (!@rename($temporaryFile, $targetFile)) {
                throw new RuntimeException('Не удалось заменить файл: ' . $targetFile);
            }
        }
    } finally {
        if (is_file($temporaryFile)) {
            @unlink($temporaryFile);
        }
    }
}

function rebuildMaskData(
    string $maskDirectory,
    string $dataDirectory,
    string $indexFile,
    string $lockFile,
    array $supportedMimeByExtension
): array {
    ensureDirectory($maskDirectory);

    $lockHandle = fopen($lockFile, 'c+');
    if ($lockHandle === false) {
        throw new RuntimeException('Не удалось открыть lock-файл генератора.');
    }

    if (!flock($lockHandle, LOCK_EX)) {
        fclose($lockHandle);
        throw new RuntimeException('Не удалось заблокировать генератор.');
    }

    $temporaryDataDirectory = $maskDirectory . DIRECTORY_SEPARATOR . '.data-build-' . bin2hex(random_bytes(6));
    $backupDataDirectory = $maskDirectory . DIRECTORY_SEPARATOR . '.data-backup-' . bin2hex(random_bytes(6));
    $temporaryIndexFile = '';
    $backupIndexFile = $maskDirectory . DIRECTORY_SEPARATOR . '.files-backup-' . bin2hex(random_bytes(6));
    $sourceByteCount = 0;
    $swappedOldData = false;
    $installedNewData = false;

    try {
        $names = listMaskNames($maskDirectory, $supportedMimeByExtension);
        ensureDirectory($temporaryDataDirectory);

        foreach ($names as $index => $name) {
            $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
            $mime = $supportedMimeByExtension[$extension] ?? null;
            if ($mime === null) {
                throw new RuntimeException('Неподдерживаемое расширение: ' . $extension);
            }

            $sourceFile = $maskDirectory . DIRECTORY_SEPARATOR . $name;
            $sourceBytes = file_get_contents($sourceFile);
            if ($sourceBytes === false) {
                throw new RuntimeException('Не удалось прочитать маску: ' . $name);
            }

            $sourceByteCount += strlen($sourceBytes);
            $record = [
                'name' => $name,
                'dataUrl' => 'data:' . $mime . ';base64,' . base64_encode($sourceBytes),
            ];

            $outputName = str_pad((string) $index, 3, '0', STR_PAD_LEFT) . '.js';
            $outputSource = "// Generated ready-mask payload.\n"
                . 'window[' . jsonForJs(DATA_GLOBAL_KEY) . '] = Object.freeze(' . jsonForJs($record) . ");\n";
            atomicWrite($temporaryDataDirectory . DIRECTORY_SEPARATOR . $outputName, $outputSource);
        }

        $indexSource = "// Generated read-only data: every supported asset currently stored in NewUI/masks.\n"
            . "(() => {\n"
            . "    'use strict';\n\n"
            . '    const GLOBAL_KEY = ' . jsonForJs(FILES_GLOBAL_KEY) . ";\n"
            . '    const FILES = Object.freeze(' . jsonForJs($names, JSON_PRETTY_PRINT) . ");\n"
            . "    window[GLOBAL_KEY] = FILES;\n"
            . "})();\n";

        $temporaryIndexFile = tempnam($maskDirectory, '.files-index-');
        if ($temporaryIndexFile === false) {
            throw new RuntimeException('Не удалось создать временный индекс files.js.');
        }
        if (file_put_contents($temporaryIndexFile, $indexSource, LOCK_EX) === false) {
            throw new RuntimeException('Не удалось записать временный индекс files.js.');
        }
        @chmod($temporaryIndexFile, 0644);

        // Build completely first, then swap the data directory and index.
        if (is_dir($dataDirectory)) {
            if (!@rename($dataDirectory, $backupDataDirectory)) {
                throw new RuntimeException('Не удалось временно убрать старую папку data.');
            }
            $swappedOldData = true;
        }

        if (!@rename($temporaryDataDirectory, $dataDirectory)) {
            if ($swappedOldData) {
                @rename($backupDataDirectory, $dataDirectory);
            }
            throw new RuntimeException('Не удалось установить новую папку data.');
        }
        $installedNewData = true;

        $hadOldIndex = is_file($indexFile);
        if ($hadOldIndex && !@rename($indexFile, $backupIndexFile)) {
            // Roll back data if the old index cannot be protected before replacement.
            removeDirectoryRecursive($dataDirectory);
            if ($swappedOldData) {
                @rename($backupDataDirectory, $dataDirectory);
            }
            throw new RuntimeException('Не удалось подготовить старый files.js к замене.');
        }

        if (!@rename($temporaryIndexFile, $indexFile)) {
            // Roll back both generated data and the index.
            removeDirectoryRecursive($dataDirectory);
            if ($swappedOldData) {
                @rename($backupDataDirectory, $dataDirectory);
            }
            if ($hadOldIndex && is_file($backupIndexFile)) {
                @rename($backupIndexFile, $indexFile);
            }
            throw new RuntimeException('Не удалось установить новый files.js.');
        }
        $temporaryIndexFile = '';

        if ($swappedOldData) {
            removeDirectoryRecursive($backupDataDirectory);
        }
        if (is_file($backupIndexFile)) {
            @unlink($backupIndexFile);
        }

        clearstatcache(true, $indexFile);
        return [
            'count' => count($names),
            'source_bytes' => $sourceByteCount,
            'files' => $names,
        ];
    } finally {
        if (is_resource($lockHandle)) {
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
        }

        if (is_dir($temporaryDataDirectory)) {
            removeDirectoryRecursive($temporaryDataDirectory);
        }

        if ($temporaryIndexFile !== '' && is_file($temporaryIndexFile)) {
            @unlink($temporaryIndexFile);
        }

        if (is_file($backupIndexFile) && !is_file($indexFile)) {
            @rename($backupIndexFile, $indexFile);
        }

        // A backup may remain only after an unexpected filesystem failure; keep live data first.
        if (is_dir($backupDataDirectory) && !$installedNewData && !is_dir($dataDirectory)) {
            @rename($backupDataDirectory, $dataDirectory);
        }
    }
}

function normalizeUploads(string $field): array
{
    if (!isset($_FILES[$field])) {
        return [];
    }

    $file = $_FILES[$field];
    if (!is_array($file['name'])) {
        return [$file];
    }

    $result = [];
    foreach ($file['name'] as $index => $name) {
        $result[] = [
            'name' => $name,
            'type' => $file['type'][$index] ?? '',
            'tmp_name' => $file['tmp_name'][$index] ?? '',
            'error' => $file['error'][$index] ?? UPLOAD_ERR_NO_FILE,
            'size' => $file['size'][$index] ?? 0,
        ];
    }

    return $result;
}

function safeUploadName(string $originalName, array $supportedMimeByExtension): string
{
    $name = basename(str_replace('\\', '/', $originalName));
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    $name = trim($name);

    if ($name === '' || $name === '.' || $name === '..' || $name[0] === '.') {
        throw new RuntimeException('Недопустимое имя файла.');
    }

    if (strlen($name) > 220) {
        throw new RuntimeException('Имя файла слишком длинное: ' . $name);
    }

    $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
    if (!isset($supportedMimeByExtension[$extension])) {
        throw new RuntimeException('Неподдерживаемый формат: ' . $name);
    }

    return $name;
}

function uniqueUploadName(string $maskDirectory, string $name): string
{
    $candidate = $name;
    $extension = (string) pathinfo($name, PATHINFO_EXTENSION);
    $base = (string) pathinfo($name, PATHINFO_FILENAME);
    $counter = 2;

    while (file_exists($maskDirectory . DIRECTORY_SEPARATOR . $candidate)) {
        $candidate = $base . ' (' . $counter . ').' . $extension;
        $counter++;
    }

    return $candidate;
}

function uploadMasks(string $maskDirectory, array $supportedMimeByExtension): array
{
    $uploads = normalizeUploads('masks');
    if (!$uploads) {
        throw new RuntimeException('Файлы для загрузки не выбраны.');
    }
    if (count($uploads) > MAX_UPLOAD_FILES) {
        throw new RuntimeException('За один раз можно загрузить не более ' . MAX_UPLOAD_FILES . ' файлов.');
    }

    ensureDirectory($maskDirectory);
    $createdFiles = [];

    try {
        foreach ($uploads as $upload) {
            $error = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($error !== UPLOAD_ERR_OK) {
                throw new RuntimeException('Ошибка загрузки файла, код: ' . $error);
            }

            $size = (int) ($upload['size'] ?? 0);
            if ($size <= 0 || $size > MAX_UPLOAD_BYTES) {
                throw new RuntimeException('Размер файла должен быть от 1 байта до ' . (MAX_UPLOAD_BYTES / 1024 / 1024) . ' МБ.');
            }

            $safeName = safeUploadName((string) $upload['name'], $supportedMimeByExtension);
            $safeName = uniqueUploadName($maskDirectory, $safeName);
            $temporaryFile = (string) ($upload['tmp_name'] ?? '');
            $destinationFile = $maskDirectory . DIRECTORY_SEPARATOR . $safeName;

            if (!is_uploaded_file($temporaryFile) || !move_uploaded_file($temporaryFile, $destinationFile)) {
                throw new RuntimeException('Не удалось сохранить загруженный файл: ' . $safeName);
            }

            @chmod($destinationFile, 0644);
            $createdFiles[] = $destinationFile;
        }

        return array_map('basename', $createdFiles);
    } catch (Throwable $error) {
        foreach ($createdFiles as $createdFile) {
            @unlink($createdFile);
        }
        throw $error;
    }
}

function deleteMaskTransactional(
    string $maskDirectory,
    string $name,
    callable $rebuild
): array {
    $safeName = basename(str_replace('\\', '/', $name));
    if ($safeName === '' || $safeName !== $name) {
        throw new RuntimeException('Недопустимое имя маски.');
    }

    $sourceFile = $maskDirectory . DIRECTORY_SEPARATOR . $safeName;
    if (!is_file($sourceFile)) {
        throw new RuntimeException('Маска не найдена: ' . $safeName);
    }

    $temporaryDeletedFile = $maskDirectory . DIRECTORY_SEPARATOR . '.deleted-' . bin2hex(random_bytes(6));
    if (!@rename($sourceFile, $temporaryDeletedFile)) {
        throw new RuntimeException('Не удалось подготовить маску к удалению.');
    }

    try {
        $result = $rebuild();
        @unlink($temporaryDeletedFile);
        return $result;
    } catch (Throwable $error) {
        @rename($temporaryDeletedFile, $sourceFile);
        throw $error;
    }
}


$action = (string) ($_POST['action'] ?? $_GET['action'] ?? '');
$directPassword = requestPassword();
$directPasswordValid = $directPassword !== '' && maskAdminAuthorized($directPassword);

// Password-only authorization placeholder: no username, PHP session or cookie.
$authorized = $directPasswordValid;
$loginError = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && $action === 'login' && !$authorized) {
    $loginError = 'Неверный пароль.';
}

$formPassword = $authorized ? $directPassword : '';

$rebuild = static function () use ($maskDirectory, $dataDirectory, $indexFile, $lockFile, $supportedMimeByExtension): array {
    return rebuildMaskData($maskDirectory, $dataDirectory, $indexFile, $lockFile, $supportedMimeByExtension);
};

$message = '';
$errorMessage = '';
$operationResult = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($action, ['upload', 'delete', 'rebuild'], true)) {
    if (!$authorized) {
        if (wantsJson()) {
            jsonResponse(['ok' => false, 'error' => 'Unauthorized'], 401);
        }
        $errorMessage = 'Неверный пароль.';
    } else {
        try {
            if ($action === 'upload') {
                $uploadedNames = uploadMasks($maskDirectory, $supportedMimeByExtension);
                try {
                    $operationResult = $rebuild();
                } catch (Throwable $rebuildError) {
                    foreach ($uploadedNames as $uploadedName) {
                        @unlink($maskDirectory . DIRECTORY_SEPARATOR . $uploadedName);
                    }
                    throw $rebuildError;
                }
                $message = 'Загружено: ' . count($uploadedNames) . '. Индекс и data/*.js пересобраны.';
                $operationResult['uploaded'] = $uploadedNames;
            } elseif ($action === 'delete') {
                $name = (string) ($_POST['name'] ?? '');
                $operationResult = deleteMaskTransactional($maskDirectory, $name, $rebuild);
                $message = 'Удалена маска: ' . $name . '. Индекс пересобран.';
                $operationResult['deleted'] = $name;
            } else {
                $operationResult = $rebuild();
                $message = 'files.js и data/*.js пересобраны.';
            }

            if (wantsJson()) {
                jsonResponse(['ok' => true, 'message' => $message, 'result' => $operationResult]);
            }
        } catch (Throwable $error) {
            $errorMessage = $error->getMessage();
            if (wantsJson()) {
                jsonResponse(['ok' => false, 'error' => $errorMessage], 500);
            }
        }
    }
}

if (!$authorized) {
    ?><!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BZN Masks Admin</title>
    <style>
        body{margin:0;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;background:#111;color:#eee;display:grid;min-height:100vh;place-items:center}
        .login{width:min(420px,calc(100% - 32px));background:#1b1b1b;border:1px solid #333;border-radius:14px;padding:24px;box-sizing:border-box}
        h1{margin:0 0 18px;font-size:24px}label{display:block;margin-bottom:8px;color:#bbb}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid #444;font:inherit}input{background:#0f0f0f;color:#fff}button{margin-top:12px;background:#fff;color:#111;font-weight:700;cursor:pointer}.error{color:#ff8f8f;margin:0 0 12px}
    </style>
</head>
<body>
<form class="login" method="post" autocomplete="off">
    <h1>BZN Masks Admin</h1>
    <?php if ($loginError !== ''): ?><p class="error"><?= escapeHtml($loginError) ?></p><?php endif; ?>
    <input type="hidden" name="action" value="login">
    <label for="password">Пароль</label>
    <input id="password" type="password" name="password" required autofocus>
    <button type="submit">Войти</button>
</form>
</body>
</html><?php
    exit;
}

try {
    $galleryNames = listMaskNames($maskDirectory, $supportedMimeByExtension);
} catch (Throwable $error) {
    $galleryNames = [];
    if ($errorMessage === '') {
        $errorMessage = $error->getMessage();
    }
}

?><!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BZN Masks Admin</title>
    <style>
        :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;background:#111;color:#eee}.wrap{width:min(1500px,calc(100% - 32px));margin:24px auto 60px}.top{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}.top h1{margin:0;font-size:26px}.muted{color:#aaa}.panel{margin-top:18px;padding:16px;background:#181818;border:1px solid #303030;border-radius:14px}.upload-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.upload-row label{display:grid;gap:7px;flex:1;min-width:280px}.upload-row input[type=file]{padding:10px;background:#0d0d0d;border:1px solid #3a3a3a;border-radius:9px;color:#ddd}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border:1px solid #444;border-radius:9px;background:#eee;color:#111;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}.button.secondary{background:#252525;color:#eee}.button.danger{background:#431d1d;color:#ffb6b6;border-color:#693030;width:100%;min-height:36px}.message,.error{padding:12px 14px;border-radius:9px;margin-top:14px}.message{background:#17351f;color:#b9f7c7;border:1px solid #285d36}.error{background:#3b1717;color:#ffc2c2;border:1px solid #6a2929}.gallery-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:26px 0 12px}.gallery-head h2{margin:0;font-size:20px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.card{min-width:0;background:#191919;border:1px solid #303030;border-radius:12px;overflow:hidden}.preview{aspect-ratio:1/1;display:grid;place-items:center;background-color:#fff;background-image:linear-gradient(45deg,#e8e8e8 25%,transparent 25%),linear-gradient(-45deg,#e8e8e8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8e8e8 75%),linear-gradient(-45deg,transparent 75%,#e8e8e8 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.preview img{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}.meta{padding:10px}.name{min-height:38px;overflow-wrap:anywhere;font-size:12px;color:#ddd;margin-bottom:8px}.empty{padding:30px;text-align:center;color:#999;border:1px dashed #444;border-radius:12px}.inline{display:inline}.toolbar{display:flex;gap:8px;flex-wrap:wrap}.count{font-variant-numeric:tabular-nums}.upload-status{margin-top:10px;color:#bbb}.upload-status.error{color:#ffc2c2}.button[disabled]{opacity:.55;cursor:wait}
    </style>
</head>
<body>
<main class="wrap">
    <div class="top">
        <div>
            <h1>BZN Masks Admin</h1>
            <div class="muted">NewUI/masks/ → files.js + data/NNN.js</div>
        </div>
        <div class="toolbar">
            <form method="post" class="inline">
                <input type="hidden" name="action" value="rebuild">
                <input type="hidden" name="password" value="<?= escapeHtml($formPassword) ?>">
                <button class="button secondary" type="submit">Пересобрать JS</button>
            </form>
            <a class="button secondary" href="upload.php">Выйти</a>
        </div>
    </div>

    <?php if ($message !== ''): ?><div class="message"><?= escapeHtml($message) ?></div><?php endif; ?>
    <?php if ($errorMessage !== ''): ?><div class="error"><?= escapeHtml($errorMessage) ?></div><?php endif; ?>

    <section class="panel">
        <form id="maskUploadForm" method="post" enctype="multipart/form-data">
            <input type="hidden" name="action" value="upload">
            <input type="hidden" name="password" value="<?= escapeHtml($formPassword) ?>">
            <div class="upload-row">
                <label>
                    <span>Новые маски</span>
                    <input id="maskUploadFiles" type="file" name="masks[]" accept=".webp,.png,.jpg,.jpeg,.gif,.svg,.avif,image/*" multiple required>
                </label>
                <button id="maskUploadButton" class="button" type="submit">Загрузить и пересобрать</button>
            </div>
            <div id="maskUploadStatus" class="upload-status">PHP max_file_uploads: <?= $phpMaxFileUploads ?>; загрузка идёт пакетами по <?= $uploadBatchSize ?>.</div>
        </form>
    </section>

    <div class="gallery-head">
        <h2>Галерея</h2>
        <div class="muted count"><?= count($galleryNames) ?> масок</div>
    </div>

    <?php if (!$galleryNames): ?>
        <div class="empty">Масок пока нет.</div>
    <?php else: ?>
        <section class="gallery">
            <?php foreach ($galleryNames as $name): ?>
                <?php $imageUrl = 'NewUI/masks/' . rawurlencode($name) . '?v=' . rawurlencode((string) (@filemtime($maskDirectory . DIRECTORY_SEPARATOR . $name) ?: time())); ?>
                <article class="card">
                    <div class="preview"><img src="<?= escapeHtml($imageUrl) ?>" alt="<?= escapeHtml($name) ?>" loading="lazy"></div>
                    <div class="meta">
                        <div class="name" title="<?= escapeHtml($name) ?>"><?= escapeHtml($name) ?></div>
                        <form method="post" onsubmit="return confirm('Удалить эту маску?\n\n<?= escapeHtml(addslashes($name)) ?>');">
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="password" value="<?= escapeHtml($formPassword) ?>">
                            <input type="hidden" name="name" value="<?= escapeHtml($name) ?>">
                            <button class="button danger" type="submit">Удалить</button>
                        </form>
                    </div>
                </article>
            <?php endforeach; ?>
        </section>
    <?php endif; ?>
</main>
<script>
(() => {
    'use strict';

    const form = document.getElementById('maskUploadForm');
    const fileInput = document.getElementById('maskUploadFiles');
    const button = document.getElementById('maskUploadButton');
    const status = document.getElementById('maskUploadStatus');
    const password = <?= jsonForJs($formPassword) ?>;
    const batchSize = <?= $uploadBatchSize ?>;

    if (!form || !fileInput || !button || !status) return;

    function showStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle('error', isError);
    }

    function reopenAdmin() {
        const loginForm = document.createElement('form');
        loginForm.method = 'post';
        loginForm.action = 'upload.php';

        const action = document.createElement('input');
        action.type = 'hidden';
        action.name = 'action';
        action.value = 'login';
        loginForm.appendChild(action);

        const passwordField = document.createElement('input');
        passwordField.type = 'hidden';
        passwordField.name = 'password';
        passwordField.value = password;
        loginForm.appendChild(passwordField);

        document.body.appendChild(loginForm);
        loginForm.submit();
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const files = Array.from(fileInput.files || []);
        if (!files.length) {
            showStatus('Выберите хотя бы один файл.', true);
            return;
        }

        button.disabled = true;
        fileInput.disabled = true;

        try {
            let uploaded = 0;
            const totalBatches = Math.ceil(files.length / batchSize);

            for (let offset = 0, batchNumber = 1; offset < files.length; offset += batchSize, batchNumber += 1) {
                const batch = files.slice(offset, offset + batchSize);
                const data = new FormData();
                data.append('action', 'upload');
                data.append('password', password);
                data.append('format', 'json');
                batch.forEach((file) => data.append('masks[]', file, file.name));

                showStatus(`Пакет ${batchNumber}/${totalBatches}: загрузка ${batch.length} файлов… Уже загружено ${uploaded}/${files.length}.`);

                const response = await fetch('upload.php', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' },
                    body: data,
                    credentials: 'omit',
                });

                let result;
                try {
                    result = await response.json();
                } catch {
                    throw new Error(`Сервер вернул не JSON (HTTP ${response.status}). Проверьте PHP warnings/error_log.`);
                }

                if (!response.ok || !result?.ok) {
                    throw new Error(result?.error || `Ошибка HTTP ${response.status}`);
                }

                uploaded += batch.length;
                showStatus(`Загружено ${uploaded}/${files.length}. JS-индекс пересобран.`);
            }

            showStatus(`Готово: загружено ${uploaded} файлов. Обновляю галерею…`);
            reopenAdmin();
        } catch (error) {
            showStatus(error?.message || 'Ошибка загрузки.', true);
            button.disabled = false;
            fileInput.disabled = false;
        }
    });
})();
</script>
</body>
</html>
