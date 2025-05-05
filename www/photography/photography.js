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

    const divider = document.createElement('hr')
    divider.className = 'gallery-divider'

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
        img.src = image_url;
        img.alt = entry.name || entry.image;

        const captionWrapper = document.createElement('div');
        captionWrapper.className = 'pswp-caption-content';

        const header = document.createElement('h2');
        header.className = 'image-name';
        header.innerHTML = entry.name
        
        const location = document.createElement('h3');
        location.className = 'image-caption';
        location.innerHTML = entry.location

        const datetime = document.createElement('h3');
        datetime.className = 'image-caption';
        datetime.innerHTML = entry.datetime

        const subHeader = document.createElement('h3');
        subHeader.className = 'image-caption';
        subHeader.innerHTML = entry.caption
    
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
  
      captionWrapper.appendChild(header)
      captionWrapper.appendChild(location)
      captionWrapper.appendChild(datetime)
      captionWrapper.appendChild(subHeader)
      captionWrapper.appendChild(exifDiv);
  
      a.appendChild(img);
      a.appendChild(captionWrapper);
      galleryCollection.appendChild(a);
    });
    
    gallery.appendChild(header)
    gallery.appendChild(subHeader)
    gallery.appendChild(divider)
    gallery.appendChild(galleryCollection)

    container.appendChild(gallery)

    function addPrefixToFilename(path, prefix) {
        const parts = path.split('/');
        const filename = parts.pop(); // "abc.jpg"

        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex === -1) return path; // no extension, skip

        const name = filename.slice(0, dotIndex);   // "abc"
        const ext = filename.slice(dotIndex);       // ".jpg"

        const newFilename = `${prefix}${name}${ext}`;
        return [...parts, newFilename].join('/');
    }

    requestAnimationFrame(() => {
        $('#gallery-collection-' + pathToGallery).justifiedGallery({
            rowHeight : 400,
            margins: 4,
            waitThumnailsLoad: true,
            lastRow: 'nojustify',
            thumbnailPath: function (currentPath, width, height, image) {
                if (Math.max(width, height) <= 512) {
                    return addPrefixToFilename(currentPath, "0s_");
                } else if (Math.max(width, height) <= 1024) {
                    return addPrefixToFilename(currentPath, "1l_");
                } else {
                    return currentPath
                }
            }
        });
    });
}

// Space out load calls
loadManifestAndRender('Los Angeles and Joshua Tree', 'February 2025', '2025_02_los_angeles_and_joshua_tree')
setTimeout(() => {
    loadManifestAndRender('San Francisco Sunsets', 'Autumn 2024', '2024_autumn_sunsets')
}, 500)
setTimeout(() => {
    loadManifestAndRender('Utah National Parks', 'March 2023', '2023_03_utah_national_parks')
}, 1000)

/* infinite scroll logic?

let start = 0;
const count = 10;

window.addEventListener('scroll', () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
  if (nearBottom) {
    loadManifestAndRender("gallery-container", "/assets/gallery/manifest.json", start, count);
    start += count;
  }
});

window.addEventListener('DOMContentLoaded', () => {
  loadManifestAndRender("gallery-container", "/assets/gallery/manifest.json", start, count);
  start += count;
});

*/