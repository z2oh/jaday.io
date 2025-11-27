import { DATA_ROOT } from './api.esm.js'

// ============================================================================
//  Gallery Rendering API
// ============================================================================

export function renderGallery(manifest) {
    return renderGalleries([manifest]);
}

export function renderGalleries(manifests) {
    const galleriesElement = document.getElementById('galleries');

    var galleries = [];
    for (let i = 0; i < manifests.length; i++) {
        // Attach the gallery element to DOM synchronously before asynchronously loading the gallery.
        let galleryElement = document.createElement('div');
        galleriesElement.appendChild(galleryElement);
        galleries.push(createGallery(galleryElement, manifests[i]));
    }
    
    return galleries;
}

// ============================================================================
//  Gallery DOM creation.
// ============================================================================

// Renders the provided collection object to the DOM and returns the HTML gallery collection;
// Note that this HTMLElement does not include the collection header; it is the actual gallery
// element holding the images to be justified.
//
// This function accepts a caller-provided `galleryElement` to fill out, which the caller must
// attach to the DOM. This is done so that the galleries are added to the DOM in the correct
// order and do not race on the completion of the aysnc manifest fetch in this function.
function createGallery(galleryElement, manifest) {
    galleryElement.className = 'gallery';

    const header = document.createElement('h2');
    header.className = 'collection-header';
    header.innerHTML = manifest.title;

    const subHeader = document.createElement('h3');
    subHeader.className = 'collection-subheader';
    subHeader.innerHTML = manifest.subtitle;

    const galleryCollectionElement = document.createElement('div');
    galleryCollectionElement.className = 'gallery-collection';
    galleryCollectionElement.id = 'gallery-collection-' + manifest.path;

    galleryElement.appendChild(header);
    galleryElement.appendChild(subHeader);
    galleryElement.appendChild(galleryCollectionElement);

    let galleryEntryElements = [];
    let lightboxItems = [];
    for (let i = 0; i < manifest.entries.length; i++) {
        let manifestEntry = manifest.entries[i];
        let entry = createGalleryEntry(manifest.path, manifestEntry);
        galleryCollectionElement.appendChild(entry.galleryEntry);
        galleryEntryElements.push(entry.galleryEntry);
        lightboxItems.push(entry.lightboxItem);
    }

    return {
        // DOM accessor for the .gallery; this holds the .gallery-collection and header.
        galleryElement: galleryElement,
        // DOM accessor for the .gallery-collection; this holds the photos.
        galleryCollectionElement: galleryCollectionElement,

        galleryEntryElements: galleryEntryElements,
        lightboxItems: lightboxItems,
    };
}

// ============================================================================
//  Gallery Entry DOM creation.
// ============================================================================

// Switches on the type of entry and creates and returns a gallery entry (`.galleryEntry`) and its
// associated lightbox item (`.lightboxItem`).
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

// Creates and returns an image gallery entry (`.galleryEntry`) and its associated lightbox item (`.lightboxItem`).
function createJustifiedImageEntry(pathToGallery, entry) {
    const image_url = DATA_ROOT + '/' + pathToGallery + '/' + entry.image;
    const image_small_thumbnail_url = DATA_ROOT + '/' + pathToGallery + '/0s_' + entry.image;
    const image_large_thumbnail_url = DATA_ROOT + '/' + pathToGallery + '/1l_' + entry.image;

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

// Creates and returns a video gallery entry (`.galleryEntry`) and its associated lightbox item (`.lightboxItem`).
function createJustifiedVideoEntry(pathToGallery, entry) {
    // When the underlying justified gallery entry size changes, resize the underlying video element to match.
    // TODO: will this fire for every video if any video is resized?
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

    const videoUrl = DATA_ROOT + '/' + pathToGallery + '/' + entry.video;
    const video_small_thumbnail_url = DATA_ROOT + '/' + pathToGallery + '/' + entry.small_thumbnail;
    const video_large_thumbnail_url = DATA_ROOT + '/' + pathToGallery + '/' + entry.large_thumbnail;

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

// ============================================================================
//  Caption DOM creation.
// ============================================================================

// Creates the full caption DOM for a given gallery, including its EXIF block.
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

    var resolvedCaption = entry.caption;

    // Replace markdown-italicized text, like _this_, with emphasis elements.
    resolvedCaption = resolvedCaption.replace(/_([^\[\]]*?)_/g, (_match, content) => {
        return `<em>${content}</em>`;
    });

    // Replace extra photo links, like [link to extra 1](extra_1) with anchor elements.
    resolvedCaption = resolvedCaption.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, key) => {
        // Prefer matching an extra if there are any available, otherwise treat this as a normal link.
        const matchExtra = entry.hasOwnProperty("extras") && entry.extras.find(extra => extra.toLowerCase().startsWith(key.toLowerCase()));
        if (matchExtra) {
            const extraUrl = DATA_ROOT + '/' + pathToGallery + '/' + matchExtra;
            return `<a href="${extraUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        } else {
            return `<a href="${key}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
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

// Creates the EXIF block DOM for a given gallery entry, to be used in its caption.
function createExifBlockElement(entry) {
    const exifDiv = document.createElement('div');
    exifDiv.className = 'exif';

    const makeSpan = (id, icon, label, value, tooltipText = "") => {
        const span = document.createElement('span');
        span.className = 'exif-row';
        span.id = id;

        const imgIcon = document.createElement('img');
        imgIcon.src = `/assets/svg/exif/${icon}`;
        imgIcon.className = 'exif-icon';

        const text = document.createElement('span');
        text.textContent = `${label} ${value}`;

        if (tooltipText.length > 0) {
            const tooltip = document.createElement('span');
            tooltip.textContent = tooltipText;
            tooltip.className = 'tooltip-text';

            text.appendChild(tooltip);
            text.classList.add('tooltip');
        }

        span.appendChild(imgIcon);
        span.appendChild(text);
        return span;
    };

    const manualLensApertureTooltip = 'This manual lens lacks electronics, meaning the aperture is not captured in EXIF metadata.'

    exifDiv.appendChild(makeSpan('iso', 'equalizer_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', 'ISO', entry.exif.iso));
    exifDiv.appendChild(makeSpan('shutter', 'shutter_speed_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', `${entry.exif.shutter_speed}s`));
    if (entry.exif.lens == "Laowa 4mm f/2.8 Fisheye") {
        exifDiv.appendChild(makeSpan('aperture', 'camera_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', 'f/', '?', manualLensApertureTooltip));
        // This lens always erroneously reports 21mm focal length in the EXIF.
        exifDiv.appendChild(makeSpan('focal-length', 'arrows_outward_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', '4mm'));
    } else {
        exifDiv.appendChild(makeSpan('aperture', 'camera_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', 'f/', entry.exif.aperture));
        exifDiv.appendChild(makeSpan('focal-length', 'arrows_outward_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', entry.exif.focal_length));
    }
    exifDiv.appendChild(makeSpan('camera', 'photo_camera_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', entry.exif.camera));
    exifDiv.appendChild(makeSpan('lens', 'circle_24dp_2D2A2A_FILL0_wght400_GRAD0_opsz24.svg', '', entry.exif.lens));

    return exifDiv;
}