import { renderGalleries } from './dom.esm.js';
import { loadCollectionsFromAPI, loadManifestFromAPI } from './api.esm.js';

import PhotoSwipeLightbox from './photoswipe/photoswipe-lightbox.esm.js';
import PhotoSwipeDynamicCaption from './photoswipe/photoswipe-dynamic-caption-plugin.esm.js';
import PhotoSwipeVideoPlugin from './photoswipe/photoswipe-video-plugin.esm.js';

// Initialize the global gallery application state into window.GalleryApp, the schema is:
// {
//   "lightbox": the PhotoSwipeLightbox object
//   "items": the globally shared PhotoSwipe data source
//   "collections": the collections.json root data source
//   "collectionIndex": the next collection from collections.json to be rendered
// }
async function init() {
    window.GalleryApp = {
        lightbox: null,
        lightboxItems: [],
        collections: null,
        collectionIndex: 0,
    };

    const lightbox = new PhotoSwipeLightbox({
        dataSource: window.GalleryApp.lightboxItems,
        pswpModule: () => import('./photoswipe/photoswipe.esm.js'),

        paddingFn: () => {
            return {
                top: 8, bottom: 8, left: 8, right: 8
            }
        },
    });

    new PhotoSwipeDynamicCaption(lightbox, {
        type: 'auto',
        captionContent: (slide) => {
            return slide.data.captionHTML;
        },
    });

    new PhotoSwipeVideoPlugin(lightbox, {});

    lightbox.on('change', () => {
        const currentIndex = lightbox.pswp.currIndex;
        const total = lightbox.pswp.getNumItems();

        // Load more images if we have fewer than 5 left.
        if (total - currentIndex < 5) {
            // Tick the renderer, and bypass the sentinel check.
            tickRender(true);
        }
    });
    lightbox.init();
    window.GalleryApp.lightbox = lightbox;

    let collections = await loadCollectionsFromAPI();
    window.GalleryApp.collections = collections;
}

// N.B. !! this function mutates global state
function addCollectionToLightbox(collection) {
    var baseItemIndex = window.GalleryApp.lightboxItems.length;
    for (let i = 0; i < collection.galleryEntryElements.length; i++) {
        window.GalleryApp.lightboxItems.push(collection.lightboxItems[i]);

        collection.galleryEntryElements[i].addEventListener('click', (e) => {
            e.preventDefault();
            window.GalleryApp.lightbox.loadAndOpen(baseItemIndex + i);
        });
    }
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            tickRender();
            observer.disconnect(entry);
        }
    });
}, {
    rootMargin: '1000px',
    threshold: [0],
});

// Tick the renderer; this will check if the sentinel is onscreen and start rendering some collections,
// re-ticking the renderer when those collections are rendered. If the sentinel is detected to be offscreen,
// this function will attach an intersection observer to the sentinel to re-tick the loop on intersection.
// If bypassSentinelCheck == true, all sentinel logic is bypassed; this is used by the lightbox to force more
// collections to render when the lightbox is running out of images.
async function tickRender(bypassSentinelCheck = false) {
    const numCollectionsToRender = Math.min(3, window.GalleryApp.collections.length - window.GalleryApp.collectionIndex);

    // Finish ticking.
    if (numCollectionsToRender === 0) {
        finishTicking();
        return;
    }

    if (!bypassSentinelCheck) {
        const sentinel = document.getElementById('load-more-sentinel');

        const sentinelRect = sentinel.getBoundingClientRect();
        const bottomThreshold = window.innerHeight + 1000;

        // If the top of the sentinel rect is above the bottom threshold, we don't need to render.
        // Add an intersection observer to the sentinel to re-tick the loop when the sentinel appears
        // at the bottom of the screen.
        if (sentinelRect.top > bottomThreshold && !bypassSentinelCheck) {
            observer.observe(sentinel);

            // Early return.
            return;
        }
    }

    // For each gallery that we are loading, construct its GalleryManifest object.
    let collectionsToRender = window.GalleryApp.collections.slice(window.GalleryApp.collectionIndex, window.GalleryApp.collectionIndex + numCollectionsToRender);
    window.GalleryApp.collectionIndex += numCollectionsToRender;
    var manifestsToRender = [];
    for(let i = 0; i < collectionsToRender.length; i++) {
        let collection = collectionsToRender[i];
        manifestsToRender.push(await loadManifestFromAPI(collection));
    }
    const collections = renderGalleries(manifestsToRender);

    // Add the collections to lightbox synchronously here, ensuring they are added in the correct
    // order. This must be done after the initial async gallery load, as we rely on information
    // from a fetched manifest.json.
    collections.forEach(collection => {
        addCollectionToLightbox(collection);
    });

    // Call justifyGallery on each collection to load and then display. Once all collections are displayed,
    // tick the renderer.
    Promise.all(collections.map(collection => {
        return justifyGallery(collection.galleryCollectionElement)
            .then(() => collection.galleryElement.style.opacity = 1);
    })).then(() => {
        tickRender();
    })
}

// This function exposes a closing footer element beneath the last gallery. It is to be called a
// single time, on the final tickRender call, after the last gallery has been rendered.
async function finishTicking() {
    const existingFooterElement = document.getElementById('footer-element');
    existingFooterElement.style.display = 'block';
}

// Calls justifiedGallery on a gallery collection element; this function returns a promise which is
// resolved when gallery layout is complete.
function justifyGallery(galleryCollectionElement) {
    return new Promise(resolve => {
        $(galleryCollectionElement).justifiedGallery({
            rowHeight: 400,
            margins: 4,
            waitThumbnailsLoad: false,
            lastRow: 'nojustify',
            justifyThreshold: .33,
            thumbnailPath: function (currentPath, width, height, image) {
                const parts = currentPath.split('/');
                const filename = parts.pop();

                const dotIndex = filename.lastIndexOf('.');
                if (dotIndex === -1) return currentPath;
                var name = filename.slice(0, dotIndex);
                const ext = filename.slice(dotIndex);

                // Remove leading 0s_ small-thumbnail prefixes. They are in the DOM so we
                // prefetch the smallest files possible when loading a gallery.
                if (name.startsWith("0s_")) {
                    name = name.slice("0s_".length)
                }

                if (Math.max(width, height) <= 512) {
                    return [...parts, `0s_${name}${ext}`].join('/')
                } else if (Math.max(width, height) <= 1024) {
                    return [...parts, `1l_${name}${ext}`].join('/')
                } else {
                    return [...parts, `${name}${ext}`].join('/')
                }
            }
        }).on('jg.complete', () => { resolve(); })
    });
}

// Wait for the app to initialize...
await init();

// ...then start the render event loop.
tickRender();