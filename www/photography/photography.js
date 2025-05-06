const DATA_ROOT = "https://data.jaday.io/photos/"
const MANIFEST_JSON = "/manifest.json"

async function loadManifest(pathToGallery) {
    let galleryUrl = DATA_ROOT + pathToGallery;
    let manifestUrl = galleryUrl + MANIFEST_JSON;

    const response = await fetch(manifestUrl);
    return response.json()
}

async function loadManifestAndRender(galleryTitle, gallerySubtitle, pathToGallery) {
    const manifest = await loadManifest(pathToGallery);

    const container = document.getElementById('gallery-wrapper');

    const gallery = document.createElement('div')
    gallery.className = 'gallery'

    const header = document.createElement('h2')
    header.className = 'collection-header'
    header.innerHTML = galleryTitle

    const subHeader = document.createElement('h3')
    subHeader.className = 'collection-subheader'
    subHeader.innerHTML = gallerySubtitle

    const galleryCollection = document.createElement('div')
    galleryCollection.className = 'gallery-collection'
    galleryCollection.id = 'gallery-collection-' + pathToGallery
  
    manifest.forEach(entry => {
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
        const resolvedCaption = entry.caption.replace(/\[([^\]]+)]\(([^)]+)\)/g, (match, text, key) => {
            const matchExtra = entry.extras.find(extra => extra.includes(key));
            if (matchExtra) {
                const extraUrl = DATA_ROOT + pathToGallery + '/' + matchExtra;
                return `<a href="${extraUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`
            }
            return text;
        });
        subHeader.innerHTML = resolvedCaption
    
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
    
        titleBox.appendChild(header)
        titleBox.appendChild(location)
        titleBox.appendChild(datetime)
        captionWrapper.appendChild(titleBox)
        captionWrapper.appendChild(subHeader)
        captionWrapper.appendChild(exifDiv);
    
        a.appendChild(img);
        a.appendChild(captionWrapper);
        galleryCollection.appendChild(a);

        const { items, lightbox } = window.GalleryApp;

        const itemIndex = items.length;
        items.push({
            src: image_url,
            width: entry.width,
            height: entry.height,
            alt: entry.name,
            captionHTML: captionWrapper.innerHTML,
        });

        a.addEventListener('click', (e) => {
            e.preventDefault();
            lightbox.loadAndOpen(itemIndex);
        });
    });
    
    gallery.appendChild(header)
    gallery.appendChild(subHeader)
    gallery.appendChild(galleryCollection)

    container.appendChild(gallery)

    requestAnimationFrame(() => {
        $('#gallery-collection-' + pathToGallery).justifiedGallery({
            rowHeight : 400,
            margins: 4,
            waitThumnailsLoad: true,
            lastRow: 'nojustify',
            justifyThreshold: .33,
            thumbnailPath: function (currentPath, width, height, image) {
                const parts = currentPath.split('/');
                const filename = parts.pop();

                const dotIndex = filename.lastIndexOf('.');
                if (dotIndex === -1) return path;
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
        });
    });
}

function debouncePromise(fn, delay) {
    let timeoutId;
    let pendingPromise = null;
    window.isLoading = true;
  
    return function (...args) {
      if (timeoutId) clearTimeout(timeoutId);
  
      return new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          pendingPromise = fn(...args);
          window.isLoading = false;
          pendingPromise.then(resolve).catch(reject);
        }, delay);
      });
    };
  }

const debouncedLoadNextCollection = debouncePromise(loadNextCollection, 200);

var collectionIndex = -1;
const collections = [
    ['Los Angeles and Joshua Tree', 'February 2025', '2025_02_los_angeles_and_joshua_tree'],
    ['San Francisco Sunsets', 'Autumn 2024', '2024_autumn_sunsets'],
    ['Angel Island', 'November 24th, 2023', '2023_11_24_angel_island'],
    ['Crater Lake National Park', 'October 2023', '2023_10_crater_lake'],
    ['Utah National Parks', 'March 2023', '2023_03_utah_national_parks']
]

async function loadNextCollection() {
    collectionIndex += 1;
    if (collectionIndex < collections.length) {
        let collection = collections[collectionIndex]
        loadManifestAndRender(collection[0], collection[1], collection[2])
    }
}