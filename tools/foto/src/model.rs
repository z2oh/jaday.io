use crate::exif::FotoExif;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PhotoDescriptor {
    pub small_thumbnail: String,
    pub large_thumbnail: String,
    pub image: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub extras: Vec<String>,
    pub width: u32,
    pub height: u32,
    pub exif: FotoExif,
    pub name: String,
    pub location: String,
    pub datetime: String,
    pub caption: String,
}
