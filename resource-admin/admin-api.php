<?php
declare(strict_types=1);

/** Protected black-box endpoint for resource administration. */
$gateway = require __DIR__ . '/bootstrap.php';
$gateway->run('admin-api.php');
