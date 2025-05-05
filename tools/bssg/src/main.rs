#![allow(dead_code)]
#![allow(unreachable_code)]
#![allow(unused_variables)]
#![allow(unused_imports)]

use std::{ffi::OsStr, path::{Path, PathBuf}};
use jstd::prelude::*;

mod builder;

#[derive(Parser, Debug)]
#[command(version, about)]
struct Args {
    #[arg(short, long, default_value_t = false)]
    watch: bool,

    #[arg(long)]
    www_path: Option<String>,

    #[arg(long)]
    out_path: Option<String>
}

fn main() -> Result<()> {
    init_log!("bssg");

    let args = Args::parse();

    let www_path = args.www_path.ok_or(anyhow!("No --www_path <PATH> provided!"))?;
    let out_path = args.out_path.ok_or(anyhow!("No --out_path <PATH> provided!"))?;

    build_site(&www_path, &out_path)?;

    if args.watch {
        watch(www_path, out_path)?;
    }

    Ok(())
}

fn build_site<P: AsRef<Path>>(www_path: P, out_path: P) -> Result<()> {
    let builder = builder::Builder::new(&www_path, &out_path)?;
    builder.build()
}

fn watch<P: AsRef<Path> + std::marker::Sync>(www_path: P, out_path: P) -> Result<()> {
    use notify_debouncer_full::{notify::*, new_debouncer, DebounceEventResult};

    // Debounced events will come in through rx.
    let (tx, rx) = std::sync::mpsc::channel::<DebounceEventResult>();

    // Set debounced watcher to recursively watch www_path.
    let mut debouncer = new_debouncer(std::time::Duration::from_millis(100), None, tx)?;
    debouncer.watch(www_path.as_ref(), notify::RecursiveMode::Recursive)?;

    // Block forever, rebuilding the site at each debounced event.
    for result in rx {
        match result {
            Ok(events) => {
                events.iter().for_each(|event| info!("{event:?}"));
                build_site(&www_path, &out_path)?;
            }
            Err(errors) => errors.iter().for_each(|error| error!("{error:?}")),
        }
    }

    Ok(())
}