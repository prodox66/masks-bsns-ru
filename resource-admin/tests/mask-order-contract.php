<?php
declare(strict_types=1);

// Branch: this filesystem contract is a CLI check, never a public administrative endpoint.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

final class MaskOrderContract
{
    private const CYCLES = 3;
    private const EXPECTED = ['z-new.webp', 'mask 2.webp', 'mask 10.webp', 'a-old.webp'];
    private const FILES = ['a-old.webp' => 1000000000, 'mask 10.webp' => 1000000200, 'mask 2.webp' => 1000000200, 'z-new.webp' => 1000000300];

    // Function: load only the actual pure listing function; authorization and page dispatch never execute.
    public static function load(string $sourcePath): void
    {
        $source = file_get_contents($sourcePath);
        if (!preg_match('/function listMaskNames\([^\n]+\n\{.*?\n\}/s', $source, $match)) {
            throw new RuntimeException('listMaskNames function was not found.');
        }
        define('MASK_SORT_EQUAL', 0);
        eval($match[0]);
    }

    // Function: newest dates win; equal dates remain naturally sorted; unsupported files stay excluded.
    public static function run(): void
    {
        for ($cycle = 1; $cycle <= self::CYCLES; $cycle++) {
            $directory = sys_get_temp_dir() . '/bzn-mask-order-' . bin2hex(random_bytes(6));
            mkdir($directory);
            $paths = [];
            try {
                foreach (self::FILES as $name => $time) {
                    $filename = $directory . '/' . $name;
                    $paths[] = $filename;
                    file_put_contents($filename, $name);
                    touch($filename, $time);
                }
                $ignored = $directory . '/ignored.txt';
                $paths[] = $ignored;
                file_put_contents($ignored, 'not a mask');
                clearstatcache();
                $actual = listMaskNames($directory, ['webp' => 'image/webp']);
                if ($actual !== self::EXPECTED) throw new RuntimeException('Newest-first ordering failed: ' . json_encode($actual));
                echo 'Mask PHP ordering ' . $cycle . '/' . self::CYCLES . ": PASS\n";
            } finally {
                // Loop: clean only the explicitly created fixture files, never a source mask directory.
                foreach ($paths as $filename) if (is_file($filename)) unlink($filename);
                rmdir($directory);
            }
        }
    }
}

MaskOrderContract::load($argv[1] ?? dirname(__DIR__, 2) . '/upload.php');
MaskOrderContract::run();
