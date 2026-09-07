// Standalone real-mask library powered by the shared library-ui host.
(() => {
    'use strict';

    const SITE_CONFIG_KEY = 'BZNMaskLibraryConfig';
    const LIBRARY_RUNTIME_CONFIG_KEY = 'BZNLibraryRuntimeConfig';
    const MASK_FILES_KEY = 'BZNReadyMaskFiles';
    const RESOURCE_LIBRARY_KEY = 'BZNResourceLibrary';
    const OPEN_BUTTON_ID = 'openMaskLibrary';
    const STATUS_ID = 'maskLibraryStatus';
    const SCRIPT_DATA_ATTRIBUTE = 'data-bzn-mask-dependency';
    const DATA_INDEX_WIDTH = 3;
    const DATA_SCRIPT_EXTENSION = '.js';
    const MASK_PREVIEW_KIND = 'image';
    const DEFAULT_MIME = 'application/octet-stream';
    const MIME_BY_EXTENSION = Object.freeze({ webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' });
    const LABELS = Object.freeze({ title: 'Готовые маски блока', use: 'Использовать' });
    const STATUS_MESSAGES = Object.freeze({ loading: 'Загрузка интерфейса…', ready: 'Готово: {count} масок.', error: 'Не удалось загрузить интерфейс библиотеки.' });

    class MaskLibrarySite {
        constructor(configuration) {
            this.configuration = configuration;
            this.files = Object.freeze(Array.from(window[MASK_FILES_KEY] || {}, (name) => String(name)));
            this.openButton = document.getElementById(OPEN_BUTTON_ID);
            this.statusNode = document.getElementById(STATUS_ID);
        }

        // Function: the shared UI reads the same central contract as the Canvas host.
        installLibraryRuntimeConfig() {
            const config = this.configuration;
            window[LIBRARY_RUNTIME_CONFIG_KEY] = Object.freeze({
                baseUrls: Object.freeze({ interface: config.interfaceRootUrl, content: Object.freeze({ masks: config.siteRootUrl }) }),
                interface: config.interface,
                content: Object.freeze({
                    masks: config.siteRootUrl,
                    readyMasksDirectory: config.maskDirectoryUrl,
                    readyMaskDataDirectory: config.maskDataDirectoryUrl,
                }),
            });
        }

        // Function: dependencies load sequentially because the resource library expects Lightbox to exist first.
        loadScript(url) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.async = false;
                script.src = url;
                script.setAttribute(SCRIPT_DATA_ATTRIBUTE, 'true');
                script.addEventListener('load', resolve, { once: true });
                script.addEventListener('error', reject, { once: true });
                document.head.appendChild(script);
            });
        }

        // Function: every indexed file becomes a generic record without filename-specific code.
        item(name, index) {
            const extension = String(name.split('.').pop() || '').toLowerCase();
            const url = new URL(encodeURIComponent(name), this.configuration.maskDirectoryUrl).href;
            const dataFileName = `${String(index).padStart(DATA_INDEX_WIDTH, '0')}${DATA_SCRIPT_EXTENSION}`;
            return Object.freeze({
                name,
                extension,
                mime: MIME_BY_EXTENSION[extension] || DEFAULT_MIME,
                preview: MASK_PREVIEW_KIND,
                thumbnail_url: url,
                data_script_url: new URL(dataFileName, this.configuration.maskDataDirectoryUrl).href,
                url,
            });
        }

        // Function: the fixed gallery page is a deterministic slice of the immutable mask index.
        providePage(context = {}) {
            const pageSize = Number(context.pageSize) || this.configuration.pageSize;
            const pageCount = Math.max(1, Math.ceil(this.files.length / pageSize));
            const page = Math.max(1, Math.min(pageCount, Number(context.page) || 1));
            const offset = (page - 1) * pageSize;
            const names = this.files.slice(offset, offset + pageSize);
            return Promise.resolve(Object.freeze({
                ok: true,
                page,
                page_size: pageSize,
                pages: pageCount,
                total: this.files.length,
                items: Object.freeze(names.map((name, pageIndex) => this.item(name, offset + pageIndex))),
            }));
        }

        // Function: the real masks open through the reusable window primitive and its masks-only profile.
        open() {
            return window[RESOURCE_LIBRARY_KEY].open({
                library: this.configuration.library,
                callerId: this.configuration.callerId,
                contentType: this.configuration.contentType,
                provider: (context) => this.providePage(context),
                labels: LABELS,
            });
        }

        // Function: initialization has one visible status and enables the entry control only after all dependencies exist.
        async initialize() {
            try {
                this.statusNode.textContent = STATUS_MESSAGES.loading;
                this.installLibraryRuntimeConfig();
                await this.loadScript(this.configuration.interface.lightboxScript);
                await this.loadScript(this.configuration.interface.resourceLibraryScript);
                this.openButton.disabled = false;
                this.openButton.addEventListener('click', () => void this.open());
                this.statusNode.textContent = STATUS_MESSAGES.ready.replace('{count}', String(this.files.length));
            } catch (error) {
                this.statusNode.textContent = STATUS_MESSAGES.error;
                throw error;
            }
        }
    }

    const site = new MaskLibrarySite(window[SITE_CONFIG_KEY]);
    window.BZNMaskLibrarySite = site;
    void site.initialize();
})();
