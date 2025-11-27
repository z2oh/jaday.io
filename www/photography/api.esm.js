export const DATA_ROOT = "https://data.jaday.io/photos"

// Returns collections.json.
export async function loadCollectionsFromAPI() {
    const COLLECTIONS_JSON = "collections.json"

    let collectionsUrl = DATA_ROOT + '/' + COLLECTIONS_JSON;
    let collectionsData = await fetch(collectionsUrl);
    return collectionsData.json();
}

// Returns manifest.json for a given gallery path.
export async function loadManifestFromAPI(pathToGallery) {
    const MANIFEST_JSON = "manifest.json"

    let manifestUrl = DATA_ROOT + '/' + pathToGallery + '/' + MANIFEST_JSON;
    let manifestData = await fetch(manifestUrl);
    return new GalleryManifest(await manifestData.json(), DATA_ROOT + '/' + pathToGallery);
}

// An object which fully describes a gallery to render. This is similar to the object described by
// manifest.json, but with all paths fully resolved instead of relative to some data source.
//
// The primary intention of this class is to decouple gallery data from rendering logic, enabling
// the renderer to be agnostic over gallery data source.
class GalleryManifest {
    constructor(data, dataRoot) {
        if (!Array.isArray(data)) {
            throw new Error("GalleryManifest constructed with invalid data:\n" + data);
        }

        this.data = [];
        for (var i = 0; i < data.length; i++) {
            this.data.push(new ManifestEntry(data[i], dataRoot));
        }
    }
}

class ManifestEntry {
    constructor(data, dataRoot) {
        // Initialize the ManifestEntry with the raw JSON object.
        Object.assign(this, data);

        this.small_thumbnail = dataRoot + '/' + this.small_thumbnail;
        this.large_thumbnail = dataRoot + '/' + this.large_thumbnail;
        if (Object.hasOwn("extras", this)) {
            for (let i = 0; i < this.extras.length; i++) {
                this.extras[i] = dataRoot + '/' + this.extras[i];
            }
        }

        if (Object.hasOwn("image", this)) {
            this.image = dataRoot + '/' + this.image;
        }

        if (Object.hasOwn("video", this)) {
            this.video = dataRoot + '/' + this.video;
        }
    }
}