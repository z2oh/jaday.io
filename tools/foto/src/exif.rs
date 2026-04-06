use jstd::prelude::*;
use serde::{Deserialize, Serialize};

use std::path::{Path, PathBuf};

// This data matches the output of:
//      exiftool.exe -T -iso -shutterspeed -aperture -focallength -cameraprofilesuniquecameramodel -cameraprofileslensprettyname -createdate <path>
//
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FotoExif {
    pub iso: String,
    pub shutter_speed: String,
    pub aperture: String,
    pub focal_length: String,
    pub camera: String,
    pub lens: String,
    pub date_raw: String,
}

pub struct ExifReader {
    exiftool_path: PathBuf,
}

/// Validates that the exiftool binary at `exiftool_path` is reachable and functional by running `exiftool -ver`.
pub fn validate_exiftool<P: AsRef<Path>>(exiftool_path: P) -> Result<()> {
    let exiftool_path = exiftool_path.as_ref();
    benchmark!(format!("Validated exiftool at `{}` in ", exiftool_path.display()), {
        let output = std::process::Command::new(exiftool_path)
            .arg("-ver")
            .output()
            .map_err(|e| anyhow!("Failed to run exiftool at `{}`: {}", exiftool_path.display(), e))?;

        if !output.status.success() {
            return Err(anyhow!(
                "exiftool at `{}` exited with status {}",
                exiftool_path.display(),
                output.status
            ));
        }

        let version = String::from_utf8_lossy(&output.stdout);
        info!(
            "exiftool version {} found at `{}`",
            version.trim(),
            exiftool_path.display()
        );
    });

    Ok(())
}

impl ExifReader {
    pub fn new<P: AsRef<Path>>(exiftool_path: P) -> Self {
        Self {
            exiftool_path: exiftool_path.as_ref().to_owned(),
        }
    }

    pub fn read<P: AsRef<Path>>(&self, path: P) -> Result<FotoExif> {
        let path_str = path.as_ref().display().to_string();

        let exif = benchmark!(std::format!("Parsed EXIF from `{}` in", &path_str), {
            let output = std::process::Command::new(&self.exiftool_path)
                .arg("-T")
                .arg("-iso")
                .arg("-shutterspeed")
                .arg("-aperture")
                .arg("-focallength")
                .arg("-cameraprofilesuniquecameramodel")
                .arg("-cameraprofileslensprettyname")
                .arg("-createdate")
                .arg(&path_str)
                .output()?;

            let output_str = String::from_utf8(output.stdout)?;
            let output_vec: Vec<&str> = output_str.split("\t").map(|s| s.trim()).collect();

            // TODO: This is a lot of clones, but I'm not sure how else to represent this. It could
            //   be some structure which holds the full output String from exiftool and then captures
            //   &str's into the buffer for each field, but self-referential structs are a pain and
            //   O(1) copies isn't that bad.
            FotoExif {
                iso: output_vec[0].to_owned(),
                shutter_speed: output_vec[1].to_owned(),
                aperture: output_vec[2].to_owned(),
                focal_length: output_vec[3].to_owned(),
                camera: output_vec[4].to_owned(),
                lens: output_vec[5].to_owned(),
                date_raw: output_vec[6].to_owned(),
            }
        });

        Ok(exif)
    }
}
