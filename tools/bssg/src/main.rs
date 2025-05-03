#![allow(dead_code)]
#![allow(unreachable_code)]
#![allow(unused_variables)]
#![allow(unused_imports)]

use std::{ffi::OsStr, path::{Path, PathBuf}};
use jstd::prelude::*;

mod builder;

fn main() -> Result<()> {
    init_log!();

    let www_path = std::path::absolute("../../www")?;
    let out_path = std::path::absolute("../../workdir/www_out")?;

    let builder = builder::Builder::new(www_path, out_path)?;
    builder.build()?;

    Ok(())
}