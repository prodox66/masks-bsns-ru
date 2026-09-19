<?php
declare(strict_types=1);

/**
 * Encapsulates the temporary same-VPS route to the shared Resource Engine.
 * The public interface remains stable when this route later becomes configurable.
 */
final class BznResourceEngineGateway
{
    private const ENGINE_HOST_DIRECTORY = 'images.bsns.ru';
    private const ENGINE_PUBLIC_ORIGIN = 'https://images.bsns.ru';
    private const ENGINE_DIRECTORY = 'resource-engine';
    private const ALLOWED_ENDPOINTS = ['api.php', 'admin-api.php'];

    /** Resolves the shared engine without exposing the hosting layout to callers. */
    public function engineDirectory(): string
    {
        $currentDomainDirectory = dirname(__DIR__);
        $sharedWebDirectory = dirname($currentDomainDirectory);
        return $sharedWebDirectory
            . DIRECTORY_SEPARATOR
            . self::ENGINE_HOST_DIRECTORY
            . DIRECTORY_SEPARATOR
            . self::ENGINE_DIRECTORY;
    }

    /** Returns one public engine asset while keeping the domain in this routing layer. */
    public function assetUrl(string $assetName): string
    {
        $safeAssetName = basename($assetName);
        return self::ENGINE_PUBLIC_ORIGIN . '/' . self::ENGINE_DIRECTORY . '/' . rawurlencode($safeAssetName);
    }

    /** Executes only an agreed Resource Engine endpoint. */
    public function run(string $endpointName): void
    {
        // Branch: arbitrary includes are rejected before a filesystem path is assembled.
        if (!in_array($endpointName, self::ALLOWED_ENDPOINTS, true)) {
            throw new RuntimeException('Unsupported resource endpoint.');
        }

        $endpointPath = $this->engineDirectory() . DIRECTORY_SEPARATOR . $endpointName;
        if (!is_file($endpointPath)) {
            throw new RuntimeException('Resource Engine is unavailable.');
        }

        require $endpointPath;
    }
}

return new BznResourceEngineGateway();
