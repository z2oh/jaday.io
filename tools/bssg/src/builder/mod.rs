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

        // Walk all files under `www_path` respecting .bssgignore as an ignore-list (.gitignore syntax).
        ignore::WalkBuilder::new(&self.www_path)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .ignore(false)
            .add_custom_ignore_filename(".bssgignore")
            .build()
            .par_bridge()
            .filter_map(|e| e.ok())
            // Skip the root itself (depth 0) and any non-file entries.
            .filter(|e| e.depth() > 0 && e.path().is_file())
            // Skip entries whose name starts with an underscore (e.g. _templates).
            .filter(|e| !e.file_name().to_str().map(|s| s.starts_with('_')).unwrap_or(false))
            .for_each(|dir_entry| {
                self.build_file(dir_entry.path()).with_context(|| std::format!("Failed trying to build {:?}", dir_entry.path())).unwrap();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_rejects_relative_www_path() {
        let result = Builder::new("relative/www", "/tmp/out");
        assert!(result.is_err());
        assert!(result.err().unwrap().to_string().contains("www_path.is_absolute()"));
    }

    #[test]
    fn new_rejects_relative_out_path() {
        let result = Builder::new("/tmp/www", "relative/out");
        assert!(result.is_err());
        assert!(result.err().unwrap().to_string().contains("out_path.is_absolute()"));
    }

    #[test]
    fn new_succeeds_with_valid_www_dir() {
        let dir = std::env::temp_dir().join("bssg_test_builder_new");
        let templates_dir = dir.join("_templates");
        std::fs::create_dir_all(&templates_dir).unwrap();

        let out_dir = std::env::temp_dir().join("bssg_test_builder_new_out");
        std::fs::create_dir_all(&out_dir).unwrap();

        let result = Builder::new(&dir, &out_dir);
        assert!(result.is_ok());

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&out_dir);
    }
}