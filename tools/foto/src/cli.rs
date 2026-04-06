use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::BufWriter,
    path::PathBuf,
};

use crate::{
    config::FotoConfig,
    exif::{ExifReader, FotoExif},
    model::PhotoDescriptor,
    util,
};

use jstd::prelude::*;

const MANIFEST_JSON: &'static str = "manifest.json";
const SMALL_THUMBNAIL_PREFIX: &'static str = "0s_";
const LARGE_THUMBNAIL_PREFIX: &'static str = "1l_";
const EXTRA_PREFIX: &'static str = "extra_"; // there will be an appended `N_` component, e.g. extra_4_

pub async fn cli(collection_path: &Option<PathBuf>, config: FotoConfig) -> Result<()> {
    let exif_reader = ExifReader::new(&config.exiftool_path);
    use inquire::{Confirm, Text};

    let collection_path: PathBuf = match collection_path {
        Some(path) => path.into(),
        None => rfd::AsyncFileDialog::new()
            .pick_folder()
            .await
            .map(|fh| PathBuf::from(fh.path()))
            .ok_or(anyhow!("Failed to open collection folder"))?,
    };

    // Check that the manifest.json path exists and check with the user before clobbering it.
    // TODO: If a manifest.json already exists, load it and allow edits.
    let manifest_path = collection_path.join(MANIFEST_JSON);
    if manifest_path.exists() {
        let continue_anyway = Confirm::new(&format!(
            "{} already exists. Continue anyway?",
            &manifest_path.display()
        ))
        .with_default(false)
        .prompt()?;
        if !continue_anyway {
            return Ok(());
        }
        std::fs::copy(&manifest_path, manifest_path.with_extension(".json.bak"))?;
    }
    info!("Manifest path: {}", manifest_path.display());

    // Collect all the jpg files in the collection; this includes thumbnails and extras.
    let jpgs: Vec<walkdir::DirEntry> = WalkDir::new(&collection_path)
        .min_depth(1)
        .max_depth(1)
        .into_iter()
        .filter_entry(|e| {
            e.file_name()
                .to_ascii_lowercase()
                .as_os_str()
                .to_str()
                .unwrap_or("")
                .ends_with("jpg")
        })
        .collect::<Result<Vec<_>, walkdir::Error>>()?;
    info!("Found {} .jpg files.", jpgs.len());

    // Sort the discovered jpgs into:
    //  * small thumbnails (matches prefix SMALL_THUMBNAIL_PREFIX)
    //  * large thumbnails (matches prefix LARGE_THUMBNAIL_PREFIX)
    //  * extra images     (matches prefix EXTRA_PREFIX, plus a
    //  * fullsize (original images)
    let mut fullsize_images = HashSet::new();
    let mut small_thumbnails: HashMap<String, String> = HashMap::new();
    let mut large_thumbnails: HashMap<String, String> = HashMap::new();
    let mut extra_images: multimap::MultiMap<String, String> = multimap::MultiMap::new();
    for jpg in jpgs {
        let filename: String = jpg
            .file_name()
            .to_str()
            .ok_or(anyhow!("Couldn't read jpg file name"))?
            .to_owned();

        if filename.starts_with(SMALL_THUMBNAIL_PREFIX) {
            let base_image = filename.strip_prefix(SMALL_THUMBNAIL_PREFIX).unwrap().to_owned();
            small_thumbnails.insert(base_image, filename);
        } else if filename.starts_with(LARGE_THUMBNAIL_PREFIX) {
            let base_image = filename.strip_prefix(LARGE_THUMBNAIL_PREFIX).unwrap().to_owned();
            large_thumbnails.insert(base_image, filename);
        } else if filename.starts_with(EXTRA_PREFIX) {
            let base_image_with_alt_id = filename.strip_prefix(EXTRA_PREFIX).unwrap().to_owned();
            let (_number, rest) = util::parse_leading_number(&base_image_with_alt_id)
                .ok_or(anyhow!("Extra without valid number! {}", &filename))?;
            let base_image = rest
                .strip_prefix("_")
                .ok_or(anyhow!("Failed to remove underscore prefix of extra! {}", &filename))?;
            extra_images.insert(base_image.to_owned(), filename);
        } else {
            fullsize_images.insert(filename);
        }
    }
    info!("Small thumbnails: {}", small_thumbnails.len());
    info!("Large thumbnails: {}", large_thumbnails.len());
    info!("Fullsize images: {}", fullsize_images.len());
    info!("Extra images: {}", extra_images.len());

    if fullsize_images.len() != large_thumbnails.len() || fullsize_images.len() != small_thumbnails.len() {
        return Err(anyhow!("Not all fullsize images have thumbnails!"));
    }

    // Validate extra_images.
    for base_image in extra_images.keys() {
        if !fullsize_images.contains(base_image) {
            return Err(anyhow!("Extra image points to unknown base image ({})", &base_image));
        }
    }

    info!("Collecting EXIF data...");
    let mut exifs: HashMap<&str, FotoExif> = benchmark!(format!("Parsing all {} EXIF took:", fullsize_images.len()), {
        fullsize_images
            .par_iter()
            .map(|p| {
                let absolute_path = collection_path.join(p);
                (p.as_str(), exif_reader.read(&absolute_path).unwrap())
            })
            .collect()
    });

    let mut previous_location: Option<String> = Option::None;
    let mut previous_timezone_offset: Option<String> = Option::None;

    let mut sorted_images: Vec<&String> = fullsize_images.iter().collect();

    sorted_images.sort_by_key(|p| {
        let exif = &exifs[p.as_str()];
        chrono::NaiveDateTime::parse_from_str(&exif.date_raw, "%Y:%m:%d %H:%M:%S").unwrap()
    });

    // TODO: map over fullsize_images iter to avoid clones and clean up muts?
    let mut descriptors: Vec<PhotoDescriptor> = Vec::new();
    // Now you can iterate in order
    for image in &sorted_images {
        let image_str: &str = &image.as_str();
        let url = format!("file:///{}", collection_path.join(image_str).display());
        if !webbrowser::open(&url).is_ok() {
            info!("Please open: {}", &url);
        }
        let exif = exifs.remove(image_str).unwrap();
        info!(
            "Parsed EXIF data:\n  camera:        {}\n  lens:          {}\n  iso:           {}\n  shutter speed: {}\n  aperture:      f/{}\n  focal length:  {}\n  date:          {}",
            exif.camera, exif.lens, exif.iso, exif.shutter_speed, exif.aperture, exif.focal_length, exif.date_raw
        );
        let image_name = Text::new("Image name").prompt()?;

        let location = Text::new("Location")
            .with_default(&previous_location.unwrap_or("".to_string()))
            .prompt()?;
        previous_location = Some(location.clone());

        let tz_offset_str = Text::new("Timezone offset? (+2, -1, etc.)")
            .with_default(&previous_timezone_offset.unwrap_or("0".to_string()))
            .prompt()?;
        previous_timezone_offset = Some(tz_offset_str.clone());
        let tz_offset: i32 = tz_offset_str.parse()?;

        let formatted_date = if let Some(dt) = util::format_date(&exif.date_raw, tz_offset) {
            Text::new("Date time").with_default(&dt).prompt()?
        } else {
            Text::new("Date time").prompt()?
        };

        let image_caption = Text::new("Image caption").prompt()?;

        let reader = image::ImageReader::open(collection_path.join(&image))?.with_guessed_format()?;
        let (width, height) = reader.into_dimensions()?;

        let extras: Vec<String> = extra_images.remove(image_str).unwrap_or_default();

        let descriptor = crate::model::PhotoDescriptor {
            small_thumbnail: small_thumbnails[image_str].clone(),
            large_thumbnail: large_thumbnails[image_str].clone(),
            image: image_str.to_owned(),
            extras,
            width,
            height,
            exif,
            name: image_name,
            datetime: formatted_date,
            location,
            caption: image_caption,
        };

        descriptors.push(descriptor);
    }

    let manifest_file = File::create(&manifest_path)?;
    let writer = BufWriter::new(manifest_file);
    serde_json::to_writer_pretty(writer, &descriptors)?;

    info!("{} is written!", manifest_path.display());

    Ok(())
}
