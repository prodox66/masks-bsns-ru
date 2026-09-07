# Function call graph

`runtime-config.js::resolveUrl <- runtime-config.js::configuration initialization`

`mask-gallery.js::MaskLibrarySite.installLibraryRuntimeConfig <- mask-gallery.js::MaskLibrarySite.initialize`

`mask-gallery.js::MaskLibrarySite.loadScript <- mask-gallery.js::MaskLibrarySite.initialize`

`mask-gallery.js::MaskLibrarySite.item <- mask-gallery.js::MaskLibrarySite.providePage`

`mask-gallery.js::MaskLibrarySite.providePage <- mask-gallery.js::MaskLibrarySite.open, external BZNResourceLibrary provider callback`

`mask-gallery.js::MaskLibrarySite.open <- index.html::#openMaskLibrary click`

`mask-gallery.js::MaskLibrarySite.initialize <- mask-gallery.js::module bootstrap`
