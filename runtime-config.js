// Central runtime configuration for the standalone mask content host.
(() => {
    'use strict';

    const CONFIGURATION_KEY = 'BZNMaskLibraryConfig';
    const SITE_ROOT_URL = new URL('./', document.baseURI).href;
    const INTERFACE_ROOT_URL = 'https://library-ui.bsns.ru/';
    const MASK_DIRECTORY_PATH = 'NewUI/masks/';
    const MASK_INDEX_PATH = `${MASK_DIRECTORY_PATH}files.js`;
    const MASK_DATA_DIRECTORY_PATH = `${MASK_DIRECTORY_PATH}data/`;
    const CALLER_ID = 'readyBoxMasks';
    const CONTENT_TYPE = 'masks';
    const LIBRARY_ID = 'masks';
    const INTERFACE_PATHS = Object.freeze({
        runtimeConfiguration: 'runtime-config.js',
        resourceLibraryScript: 'assets/resource-library-v2.js',
        resourceLibraryStylesheet: 'assets/resource-library.css',
        libraryWindowScript: 'NewUI/Library_Window.js',
        libraryWindowConfiguration: 'NewUI/windows/library_window.json',
        libraryWindowFileBridge: 'NewUI/windows/library_window.data.js',
        lightboxScript: 'assets/lightbox.js',
        lightboxStylesheet: 'assets/lightbox.css',
    });

    // Function: one resolver owns every resource URL relative to its designated host.
    function resolveUrl(path, rootUrl) {
        return new URL(path, rootUrl).href;
    }

    // Object: applications may replace the complete configuration before loading this file.
    window[CONFIGURATION_KEY] = window[CONFIGURATION_KEY] || Object.freeze({
        siteRootUrl: SITE_ROOT_URL,
        interfaceRootUrl: INTERFACE_ROOT_URL,
        library: LIBRARY_ID,
        callerId: CALLER_ID,
        contentType: CONTENT_TYPE,
        maskDirectoryUrl: resolveUrl(MASK_DIRECTORY_PATH, SITE_ROOT_URL),
        maskIndexUrl: resolveUrl(MASK_INDEX_PATH, SITE_ROOT_URL),
        maskDataDirectoryUrl: resolveUrl(MASK_DATA_DIRECTORY_PATH, SITE_ROOT_URL),
        interface: Object.freeze(Object.fromEntries(
            Object.entries(INTERFACE_PATHS).map(([key, path]) => [key, resolveUrl(path, INTERFACE_ROOT_URL)]),
        )),
    });
})();
