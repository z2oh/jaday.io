use std::{borrow::Borrow, collections::HashMap, path::{Path, PathBuf}, sync::LazyLock};
use jstd::prelude::*;

use handlebars::template;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub mod transformers;
use  transformers::Transformer;
static HANDLEBARS_TRANSFORMER_JSON: std::sync::LazyLock<serde_json::Value> = LazyLock::new(|| {
    json!({ "hello": "world" })
});
static HANDLEBARS_TRANSFORMER: std::sync::LazyLock<transformers::HandlebarsTransformer<'static, serde_json::Value>> = LazyLock::new(|| {
    transformers::HandlebarsTransformer::new(&HANDLEBARS_TRANSFORMER_JSON)
});

mod lazy_cache;

#[derive(Debug, Serialize, Deserialize)]
struct RedirectMap {
    redirect_map: Option<HashMap<PathBuf, Vec<PathBuf>>>,
}

pub struct Builder {
    www_path: PathBuf,
    out_path: PathBuf,
    redirects_map: Option<HashMap<PathBuf, PathBuf>>,
    template_cache: lazy_cache::LazyCache,
}

impl Builder {
    pub fn new<P: AsRef<Path>>(www_path: P, out_path: P) -> Result<Builder> {
        let www_path = www_path.as_ref().to_path_buf();
        let out_path = out_path.as_ref().to_path_buf();

        if !www_path.is_absolute() || !out_path.is_absolute() {
            return Err(anyhow!(
                "www_path.is_absolute(): {}; out_path.is_absolute(): {}",
                www_path.is_absolute(),
                out_path.is_absolute()))
        }

        let redirects_path: PathBuf = www_path.join("redirects");
        let redirects_map = if std::fs::exists(&redirects_path)? {
            benchmark!("Parsed redirects map in ", {
                let redirects_map: HashMap<PathBuf, PathBuf> = serde_json::from_reader(std::fs::File::open(&redirects_path)?)?;
                Some(redirects_map)
            })
        } else {
            warn!("No redirects file found at `{}`", &redirects_path.display());
            None
        };

        let template_cache = lazy_cache::LazyCache::new(www_path.join("_templates").into())?;

        Ok(Builder { www_path, out_path, redirects_map, template_cache })
    }

    /// Root entry point for building the site.
    pub fn build(self) -> Result<()> {
        // Append _bak to the out_path.
        let out_bak_path: PathBuf = {
            let mut buf = self.out_path.clone();
            let mut final_str = buf.file_name().unwrap().to_owned();
            final_str.push("_bak");
            buf.set_file_name(final_str);
            buf
        };

        // If needed, overwrite the backup build directory with the current build directory.
        if self.out_path.exists() {
            match std::fs::remove_dir_all(&out_bak_path) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound =>
                return Err(e).with_context(
                    || std::format!("Failed to remove backup build directory: {}", &out_bak_path.display())),
                _ => {
                    // Instead of calling rename directly on `out/`, call it on each child of `out/` to avoid
                    // permission issues when some http server is serving the `out/` folder.
                    WalkDir::new(&self.out_path)
                        .min_depth(1)
                        .max_depth(1)
                        .into_iter()
                        .par_bridge()
                        .for_each(|dir_entry| {
                            let dir_entry = dir_entry.unwrap();
                            let mut out_path = out_bak_path.clone();
                            out_path.push(dir_entry.path().file_name().unwrap());
                            // N.B. Calling create_dir_all concurrently from multiple threads or processes is
                            //      guaranteed not to fail due to a race condition with itself.
                            //      See: https://doc.rust-lang.org/std/fs/fn.create_dir_all.html#errors
                            let _ = std::fs::create_dir_all(&out_path.parent().unwrap());
                            std::fs::rename(dir_entry.path(), out_path).unwrap();
                        })
                }
            }
        }

        // Walk all files under `www_path` and concurrently call self.build_file on them.
        WalkDir::new(&self.www_path)
            .min_depth(1)
            .into_iter()
            // Skip files and directories that start with an underscore.
            .filter_entry(|e| !e.file_name().to_str().map(|s| s.starts_with("_")).unwrap_or(false))
            .par_bridge()
            .filter_map(|e| e.ok())
            .filter(|dir_entry| dir_entry.path().is_file())
            .for_each(|dir_entry| {
                self.build_file(&dir_entry.path()).with_context(|| std::format!("Failed trying to build {:?}", &dir_entry.path())).unwrap();
            });

        // Emit redirect pages.
        let redirect_template_arc = self.template_cache.get_or_fetch("redirect.html")?;
        let redirect_template: &String = redirect_template_arc.borrow();
        if let Some(redirects_map) = self.redirects_map {
            for (from, to) in &redirects_map {
                let out_path = self.out_path.join(&from);
                let to_url = std::format!("/{}", to.to_str().unwrap());
                info!("{}", &out_path.display());
                let out_html = redirect_template.to_owned().replace(r"{{ url }}", &to_url);
                std::fs::create_dir_all(&out_path.parent().unwrap())?;
                std::fs::write(&out_path, out_html)?;
            }
        }

        Ok(())
    }

    /// This function is thread-safe.
    fn build_file(
        &self,
        file_path: &Path,
    ) -> Result<()> {
        if file_path.is_dir() {
            return Err(anyhow!("build_file called on directory"));
        }

        let relative_path = file_path.strip_prefix(&self.www_path).unwrap();
        let out_file_path = &self.out_path.join(relative_path);

        // N.B. Calling create_dir_all concurrently from multiple threads or processes is
        //      guaranteed not to fail due to a race condition with itself.
        //      See: https://doc.rust-lang.org/std/fs/fn.create_dir_all.html#errors
        let _ = std::fs::create_dir_all(&out_file_path.parent().unwrap());

        match file_path.file_name().map(|name| name.to_str().unwrap_or_default()) {
            Some("redirects") => {
                trace!("Skipping redirects file {:?}", &file_path);
            }
            _ => match file_path.extension().map(|ext| ext.to_str().unwrap_or_default()) {
                Some("html") => {
                    trace!("Transforming html {:?}", &out_file_path);
                    let html = std::fs::read_to_string(file_path)?;
                    let out_html = (&*HANDLEBARS_TRANSFORMER).transform(html)?;
                    std::fs::write(out_file_path, out_html)?;
                }
                _ => {
                    trace!("Copying {:?}", &out_file_path);
                    std::fs::copy(file_path, out_file_path)?;
                }
            }
        }
        
        Ok(())
    }
}