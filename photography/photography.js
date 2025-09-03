import PhotoSwipeLightbox from './photoswipe/photoswipe-lightbox.esm.js';
import PhotoSwipeDynamicCaption from './photoswipe/photoswipe-dynamic-caption-plugin.esm.js';
import PhotoSwipeVideoPlugin from './photoswipe/photoswipe-video-plugin.esm.js';

const DATA_ROOT = "https://data.jaday.io/photos/"
const MANIFEST_JSON = "/manifest.json"
const COLLECTIONS_JSON = "collections.json"

async function init() {
    window.GalleryApp = {
        lightbox: null,
        items: [], // shared PhotoSwipe dataSource
    };

    const lightbox = new PhotoSwipeLightbox({
        dataSource: window.GalleryApp.items,
        pswpModule: () => import('./photoswipe/photoswipe.esm.js'),

        paddingFn: (viewportSize) => {
            return {
                top: 8, bottom: 8, left: 8, right: 8
            }
        },
    });

    const captionPlugin = new PhotoSwipeDynamicCaption(lightbox, {
        type: 'auto',
        captionContent: (slide) => {
            return slide.data.captionHTML;
        },
    });

    const videoPlugin = new PhotoSwipeVideoPlugin(lightbox, {});

    lightbox.on('change', () => {
        const currentIndex = lightbox.pswp.currIndex;
        const total = lightbox.pswp.getNumItems();

        // Load more images if we have fewer than 5 left.
        if (total - currentIndex < 5) {
            // Tick the renderer, and bypass the sentinel check.
            tickRender(true);
        }
    });

    window.GalleryApp.lightbox = lightbox;
    lightbox.init();

    tickRender();
}

// Returns manifest JSON.
async function loadManifest(pathToGallery) {
    let galleryUrl = DATA_ROOT + pathToGallery;
    let manifestUrl = galleryUrl + MANIFEST_JSON;

    const response = await fetch(manifestUrl);
    return response.json();
}

function createExifBlockElement(entry) {
    const exifDiv = document.createElement('div');
    exifDiv.className = 'exif';

    const makeSpan = (id, icon, label, value) => {
        const span = document.createElement('span');
        span.className = 'exif-row';
        span.id = id;

        const imgIcon = document.createElement('img');
        imgIcon.src = `/assets/svg/exif/${icon}`;
        imgIcon.className = 'exif-icon';

        const text = document.createElement('span');
        text.textContent = `${label} ${value}`;

        span.appendChild(imgIcon);
        span.appendChild(text);
        return span;
    };

    exifDiv.appendChild(makeSpan('iso', 'equalizer_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', 'ISO', entry.exif.iso));
    exifDiv.appendChild(makeSpan('shutter', 'shutter_speed_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', `${entry.exif.shutter_speed}s`));
    exifDiv.appendChild(makeSpan('aperture', 'camera_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', 'f/', entry.exif.aperture));
    exifDiv.appendChild(makeSpan('focal-length', 'arrows_outward_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', entry.exif.focal_length));
    exifDiv.appendChild(makeSpan('camera', 'photo_camera_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', entry.exif.camera));
    exifDiv.appendChild(makeSpan('lens', 'circle_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', entry.exif.lens));

    return exifDiv;
}

function createCaptionElement(pathToGallery, entry) {
    const captionWrapper = document.createElement('div');
    captionWrapper.className = 'pswp-caption-content';

    const titleBox = document.createElement('div')
    titleBox.className = 'title-box'

    const header = document.createElement('h2');
    header.className = 'image-name';
    header.innerHTML = entry.name

    const location = document.createElement('h3');
    location.className = 'image-location';
    location.innerHTML = entry.location

    const datetime = document.createElement('h3');
    datetime.className = 'image-datetime';
    datetime.innerHTML = entry.datetime

    const subHeader = document.createElement('h3');
    subHeader.className = 'image-caption';
    const resolvedCaption = entry.caption.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, key) => {
        const matchExtra = entry.extras.find(extra => extra.includes(key));
        if (matchExtra) {
            const extraUrl = DATA_ROOT + pathToGallery + '/' + matchExtra;
            return `<a href="${extraUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`
        }
        return text;
    });
    subHeader.innerHTML = resolvedCaption

    titleBox.appendChild(header);
    titleBox.appendChild(location);
    titleBox.appendChild(datetime);

    const exifDiv = createExifBlockElement(entry);

    captionWrapper.appendChild(titleBox);
    captionWrapper.appendChild(subHeader);
    captionWrapper.appendChild(exifDiv);

    return captionWrapper;
}

function createJustifiedImageEntry(pathToGallery, entry) {
    const image_url = DATA_ROOT + pathToGallery + '/' + entry.image;
    const image_small_thumbnail_url = DATA_ROOT + pathToGallery + '/0s_' + entry.image;
    const image_large_thumbnail_url = DATA_ROOT + pathToGallery + '/1l_' + entry.image;

    const a = document.createElement('a');
    a.href = image_url;
    a.dataset.pswpWidth = entry.width;
    a.dataset.pswpHeight = entry.height;

    const img = document.createElement('img');
    img.className = entry.width > entry.height ? 'is-landscape' : 'is-portrait';
    img.src = image_small_thumbnail_url;
    img.alt = entry.name || entry.image;

    const captionWrapper = createCaptionElement(pathToGallery, entry);

    a.appendChild(img);
    a.appendChild(captionWrapper);

    let lightboxItem = {
        src: image_url,
        width: entry.width,
        height: entry.height,
        alt: entry.name,
        captionHTML: captionWrapper.innerHTML,
    };

    return { galleryEntry: a, lightboxItem: lightboxItem, };
}

/// When the underlying justified gallery entry size changes, resize the underlying video element to match.
/// TODO: will this fire for every video if any video is resized?
const videoResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        let video = entry.target.getElementsByTagName('video')[0];
        if (entry.contentRect.width) {
            video.width = entry.contentRect.width;
        }
        if (entry.contentRect.height) {
            video.height = entry.contentRect.height;
        }
    }
});

function createJustifiedVideoEntry(pathToGallery, entry) {
    const videoUrl = DATA_ROOT + pathToGallery + '/' + entry.video;
    const video_small_thumbnail_url = DATA_ROOT + pathToGallery + '/' + entry.small_thumbnail;
    const video_large_thumbnail_url = DATA_ROOT + pathToGallery + '/' + entry.large_thumbnail;

    const a = document.createElement('a');
    a.href = videoUrl;
    a.dataset.pswpWidth = entry.width;
    a.dataset.pswpHeight = entry.height;
    a.dataset.pswpType = "video";

    const img = document.createElement('img');
    // 1x1 transparent pixel
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    img.width = entry.width;
    img.height = entry.height;
    img.style = "display: none;"

    const video = document.createElement('video');
    video.className = entry.width > entry.height ? 'is-landscape' : 'is-portrait';
    video.src = videoUrl;
    video.alt = entry.name || entry.video;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;

    const source = document.createElement('source');
    source.src = videoUrl;
    source.type = "video/mov";

    video.appendChild(source);

    const captionWrapper = createCaptionElement(pathToGallery, entry);

    a.appendChild(img);
    a.appendChild(video);
    a.appendChild(captionWrapper);

    videoResizeObserver.observe(a);

    let lightboxItem = {
        videoSrc: videoUrl,
        width: entry.width,
        height: entry.height,
        alt: entry.name,
        type: 'video',
        captionHTML: captionWrapper.innerHTML,
    };

    return { galleryEntry: a, lightboxItem: lightboxItem, };
}

var cIndex = 0;
const csp = await fetch(DATA_ROOT + COLLECTIONS_JSON);
const cs = await csp.json();

function addCollectionToLightbox(collection) {
    const { items, lightbox } = window.GalleryApp;

    var baseItemIndex = items.length;
    for (let i = 0; i < collection.galleryEntryElements.length; i++) {
        items.push(collection.lightboxItems[i]);

        collection.galleryEntryElements[i].addEventListener('click', (e) => {
            e.preventDefault();
            lightbox.loadAndOpen(baseItemIndex + i);
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
    const numToRender = Math.min(3, cs.length - cIndex);

    // Finish ticking.
    if (numToRender === 0) { return; }

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

    const renderCollectionPromises = [];
    for (let i = 0; i < numToRender; i++) {
        renderCollectionPromises.push(createGallery(cs[cIndex + i]));
    }
    cIndex += numToRender;
    const collections = await Promise.all(renderCollectionPromises);

    Promise.all(collections.map(collection => {
        addCollectionToLightbox(collection);
        return justifyGallery(collection.galleryElement);
    })).then(() => { tickRender() })
}

// Calls justifiedGallery on a gallery collection element; this function returns a promise which is
// resolved when gallery layout is complete.
function justifyGallery(galleryElement) {
    return new Promise(resolve => {
        $(galleryElement).justifiedGallery({
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

// Determine the type of gallery element to be rendered, and add it to the DOM.
function createGalleryEntry(galleryPath, entry) {
    let type;
    if (Object.hasOwn(entry, "image")) {
        type = "image";
    } else if (Object.hasOwn(entry, "video")) {
        type = "video";
    } else {
        console.warn("Unknown entry type.\n" + entry);
    }
    if (type === "image") {
        return createJustifiedImageEntry(galleryPath, entry);
    } else if (type === "video") {
        return createJustifiedVideoEntry(galleryPath, entry);
    }
}

// Renders the provided collection object to the DOM and returns the HTML gallery collection;
// Note that this HTMLElement does not include the collection header; it is the actual gallery
// element holding the images to be justified.
async function createGallery(collection) {
    const galleryContainer = document.getElementById('gallery-wrapper');

    const gallery = document.createElement('div');
    gallery.className = 'gallery';
    galleryContainer.appendChild(gallery);

    const header = document.createElement('h2');
    header.className = 'collection-header';
    header.innerHTML = collection.title;

    const subHeader = document.createElement('h3');
    subHeader.className = 'collection-subheader';
    subHeader.innerHTML = collection.subtitle;

    const galleryCollection = document.createElement('div');
    galleryCollection.className = 'gallery-collection';
    galleryCollection.id = 'gallery-collection-' + collection.path;

    gallery.appendChild(header);
    gallery.appendChild(subHeader);
    gallery.appendChild(galleryCollection);

    const manifest = await loadManifest(collection.path);

    let galleryEntryElements = [];
    let lightboxItems = [];
    for (var i = 0; i < manifest.length; i++) {
        let manifestEntry = manifest[i];
        let entry = createGalleryEntry(collection.path, manifestEntry);
        galleryCollection.appendChild(entry.galleryEntry);
        galleryEntryElements.push(entry.galleryEntry);
        lightboxItems.push(entry.lightboxItem);
    }

    return { galleryElement: galleryCollection, galleryEntryElements: galleryEntryElements, lightboxItems: lightboxItems };
}

await init();