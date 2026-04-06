use jstd::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FotoConfig {
    pub exiftool_path: String,
    // Held open for the lifetime of the program to prevent the binary from being
    // deleted or replaced while running.
    #[serde(skip)]
    pub(crate) _exiftool_handle: Option<std::fs::File>,
}

impl Default for FotoConfig {
    fn default() -> Self {
        Self {
            exiftool_path: String::new(),
            _exiftool_handle: None,
        }
    }
}

pub fn load() -> Result<FotoConfig> {
    let mut config: FotoConfig = confy::load("foto", None).map_err(|e| anyhow!("Failed to load config: {}", e))?;

    // Attempt to normalize the exiftool_path on load; this is best-effort only.
    config.exiftool_path = config
        .exiftool_path
        .trim()
        .trim_matches(|c| c == '"' || c == '\'' || c == ' ')
        .to_owned();

    Ok(config)
}

pub fn save(config: &FotoConfig) -> Result<()> {
    confy::store("foto", None, config).map_err(|e| anyhow!("Failed to save config: {}", e))
}
