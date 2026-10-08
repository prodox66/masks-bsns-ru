<?php
declare(strict_types=1);

/** Keeps administrator order separate from source bytes and filesystem modification times. */
final class BznMaskOrder
{
    private array $settings;
    private string $filename;

    /** Both PHP and the static generator read the same small catalog settings file. */
    public function __construct(string $directory)
    {
        $this->settings = json_decode(file_get_contents(dirname(__DIR__) . '/config/mask-catalog.json'), true, flags: JSON_THROW_ON_ERROR);
        $this->filename = $directory . DIRECTORY_SEPARATOR . $this->settings['orderFile'];
    }

    /** Unlisted new uploads keep their existing newest-first order; ranked resources follow their saved sequence. */
    public function ordered(array $names): array
    {
        if (!is_file($this->filename)) return $names;
        $record = json_decode(file_get_contents($this->filename), true, flags: JSON_THROW_ON_ERROR);
        $ranks = array_flip((array) ($record['names'] ?? []));
        $fresh = array_values(array_filter($names, static fn(string $name): bool => !array_key_exists($name, $ranks)));
        $ranked = array_values(array_filter($names, static fn(string $name): bool => array_key_exists($name, $ranks)));
        usort($ranked, static fn(string $left, string $right): int => $ranks[$left] <=> $ranks[$right]);
        return array_merge($fresh, $ranked);
    }

    /** Persists only validated existing basenames using one atomic metadata replacement. */
    public function save(array $names): void
    {
        foreach ($names as $name) {
            // Guard: clients cannot install paths or repeated catalog entries through a manual order.
            if ($name !== basename(str_replace('\\', '/', $name))) throw new InvalidArgumentException('Invalid mask order.');
        }
        if (count(array_unique($names)) !== count($names)) throw new InvalidArgumentException('Repeated mask order entry.');
        $source = json_encode(['version' => $this->settings['version'], 'names' => array_values($names)], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $temporary = $this->filename . '.tmp';
        if (file_put_contents($temporary, $source, LOCK_EX) === false || !rename($temporary, $this->filename)) throw new RuntimeException('Cannot save mask order.');
        chmod($this->filename, $this->settings['fileMode']);
    }
}
