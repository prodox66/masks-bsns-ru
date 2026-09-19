<?php
declare(strict_types=1);

/** Public black-box endpoint for lists, images and thumbnails. */
$gateway = require __DIR__ . '/bootstrap.php';
$gateway->run('api.php');
