export const DATA_ROOT = "https://data.jaday.io/photos"

// Returns collections.json.
export async function loadCollections() {
    const COLLECTIONS_JSON = "collections.json"

    let collectionsUrl = DATA_ROOT + '/' + COLLECTIONS_JSON;
    let collectionsData = await fetch(collectionsUrl);
    return collectionsData.json();
}

// Returns manifest.json for a given gallery path.
export async function loadManifest(pathToGallery) {
    const MANIFEST_JSON = "manifest.json"

    let manifestUrl = DATA_ROOT + '/' + pathToGallery + '/' + MANIFEST_JSON;
    let manifestData = await fetch(manifestUrl);
    return manifestData.json();
}