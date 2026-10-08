<?php
declare(strict_types=1);

/** Reuses the existing mask upload/rebuild owner behind an authenticated host endpoint. */
final class BznMaskAdministration
{
    private array $settings;
    private array $mime;
    private string $directory;

    /** An optional private storage root is only for filesystem contracts, never an HTTP request field. */
    public function __construct(?string $storageRoot = null)
    {
        $ownerRoot = dirname(__DIR__);
        $this->settings = json_decode(file_get_contents($ownerRoot . '/config/mask-catalog.json'), true, flags: JSON_THROW_ON_ERROR);
        $flag = $this->settings['libraryOnlyFlag'];
        if (!defined($flag)) define($flag, true);
        $this->mime = self::legacyConfiguration()['mime'];
        $root = $storageRoot ?? $ownerRoot;
        $this->directory = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $this->settings['sourceFolder']);
    }

    /** Loads legacy helper settings once, including when one CLI contract constructs several private catalogs. */
    private static function legacyConfiguration(): array
    {
        static $configuration = null;
        if ($configuration !== null) return $configuration;
        require_once dirname(__DIR__) . '/upload.php';
        $configuration = ['mime' => $supportedMimeByExtension, 'batchSize' => $uploadBatchSize];
        return $configuration;
    }

    public function limits(): array { return ['batchSize' => self::legacyConfiguration()['batchSize']]; }

    /** Resolves ids against the real current names; browser paths are never accepted. */
    private function selected(string $id): string
    {
        foreach ($this->names() as $name) {
            // Loop: only a current basename whose server-generated digest matches the request may be mutated.
            if (hash_equals(hash($this->settings['hash'], $name), $id)) return $name;
        }
        throw new InvalidArgumentException('Маска не найдена.');
    }

    public function names(): array { return listMaskNames($this->directory, $this->mime); }

    /** Rebuilds the same static index and file-mode payloads that the native mask picker already consumes. */
    private function rebuild(): array
    {
        return rebuildMaskData($this->directory, $this->directory . '/' . $this->settings['dataFolder'], $this->directory . '/' . $this->settings['indexFile'], $this->directory . '/' . $this->settings['lockFile'], $this->mime);
    }

    /** Serializes admin mutations while the existing builder keeps its own publication lock. */
    public function perform(string $action, string $id, int $position): array
    {
        $lock = fopen($this->directory . '/' . $this->settings['mutationLock'], 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Библиотека масок занята.');
        try {
            if ($action === 'upload') return $this->upload();
            $name = $this->selected($id);
            if ($action === 'delete') return $this->remove($name);
            if ($action === 'order') return $this->move($name, $position);
            throw new InvalidArgumentException('Неизвестная операция масок.');
        } finally {
            // Release only the lock owned by this request, including every error path.
            flock($lock, LOCK_UN); fclose($lock);
        }
    }

    /** Keeps HTTP upload validation and collision-free names in their original owner. */
    private function upload(): array
    {
        $names = uploadMasks($this->directory, $this->mime);
        try { return $this->rebuild(); }
        catch (Throwable $error) {
            // Only this failed request's newly created files are archived; previous sources remain untouched.
            foreach ($names as $name) $this->archive($name, true);
            throw $error;
        }
    }

    /** Removes one selected source from the picker while retaining its recoverable private copy. */
    private function remove(string $name): array
    {
        $this->archive($name, false);
        return deleteMaskTransactional($this->directory, $name, fn(): array => $this->rebuild());
    }

    /** Changes order metadata only; source images keep their exact bytes and modification times. */
    private function move(string $name, int $position): array
    {
        $names = $this->names();
        if ($position < $this->settings['one'] || $position > count($names)) throw new InvalidArgumentException('Неверная позиция маски.');
        $previous = $names;
        array_splice($names, array_search($name, $names, true), $this->settings['one']);
        array_splice($names, $position - $this->settings['one'], $this->settings['zero'], [$name]);
        $order = new BznMaskOrder($this->directory);
        $order->save($names);
        try { return $this->rebuild(); }
        catch (Throwable $error) { $order->save($previous); throw $error; }
    }

    /** Archives only an explicitly selected basename under a non-public hidden directory. */
    private function archive(string $name, bool $move): void
    {
        $folder = $this->directory . '/' . $this->settings['trashFolder'];
        if (!is_dir($folder) && !mkdir($folder, $this->settings['directoryMode'], true)) throw new RuntimeException('Не удалось сохранить удаляемую маску.');
        $target = $folder . '/' . gmdate($this->settings['archiveDate']) . '-' . bin2hex(random_bytes($this->settings['archiveRandomBytes'])) . '-' . $name;
        $source = $this->directory . '/' . $name;
        $saved = $move ? rename($source, $target) : copy($source, $target);
        if (!$saved) throw new RuntimeException('Не удалось сохранить удаляемую маску.');
        chmod($target, $this->settings['fileMode']);
    }
}
