<?php
declare(strict_types=1);

$gateway = require __DIR__ . '/bootstrap.php';
$pageTitle = 'BZN — администрирование ресурсов';
$rootId = 'resourceAdminGatewayRoot';
$styleUrl = $gateway->assetUrl('resource-admin.css');
$clientUrl = $gateway->assetUrl('resource-client.js');
$adminUrl = $gateway->assetUrl('resource-admin.js');
?>
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title><?= htmlspecialchars($pageTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></title>
    <link rel="stylesheet" href="<?= htmlspecialchars($styleUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
</head>
<body class="bzn-resource-admin-page">
    <main id="<?= htmlspecialchars($rootId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" aria-label="Администрирование галереи"></main>
    <script src="<?= htmlspecialchars($clientUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"></script>
    <script src="<?= htmlspecialchars($adminUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"></script>
    <script>
        (() => {
            // Completed bootstrap: the shared widget talks only to this gateway URL.
            const root = document.getElementById(<?= json_encode($rootId, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>);
            const options = Object.freeze({ baseUrl: new URL('./', window.location.href).href, modal: false });
            window.BZNResourceAdmin.mount(root, options);
        })();
    </script>
</body>
</html>
