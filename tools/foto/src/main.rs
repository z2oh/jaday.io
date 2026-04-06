use std::path::PathBuf;

use clap::Parser;
use inquire::Text;
use jstd::prelude::*;

mod cli;
mod config;
mod exif;
mod model;
mod util;

#[derive(Parser, Debug)]
#[command(version, about)]
struct Args {
    #[arg(long, default_value_t = false)]
    dump_only: bool,

    #[arg(short, long)]
    collection: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    init_log!("foto");

    let args = Args::parse();
    let config = configure_runtime()?;

    cli::cli(&args.collection, config).await
}

fn configure_runtime() -> Result<config::FotoConfig> {
    benchmark!("Configured runtime in ", {
        let mut config = config::load()?;

        if config.exiftool_path.is_empty() {
            config.exiftool_path = Text::new("Path to exiftool:").prompt()?;
            config::save(&config)?;
        }

        config._exiftool_handle = Some(validate_exiftool(&config.exiftool_path)?);

        Ok(config)
    })
}

/// Validates that the exiftool binary at `path` is reachable and functional, and returns an open file handle to it.
fn validate_exiftool(path: &str) -> Result<std::fs::File> {
    let handle = std::fs::File::open(path)
        .map_err(|e| anyhow!("Failed to open file handle for exiftool at `{}`: {}", path, e))?;
    exif::validate_exiftool(path)?;
    Ok(handle)
}
