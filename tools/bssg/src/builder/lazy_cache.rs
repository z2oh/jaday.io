use std::hash::Hash;
use std::borrow::Borrow;
use quick_cache::Equivalent;
use std::path::{Path, PathBuf};
use jstd::prelude::*;

/// Lazy-loaded concurrent cache over a directory. The first fetch of a file will cache the file's
/// contents into an Arc<String> that can then be shared across threads.
pub struct LazyCache {
    dir: PathBuf,
    cache: quick_cache::sync::Cache<String, std::sync::Arc<String>>,
}

impl LazyCache {
    pub fn new(dir: PathBuf) -> Result<Self> {
        if !dir.is_dir() {
            return Err(anyhow!("LazyCache::new called with non-directory path: `{}`", dir.display()));
        }

        // Attempt to presize the cache with the number of files in the directory.
        let num_files = WalkDir::new(&dir).min_depth(1).into_iter().filter_map(Result::ok).count();
        trace!("Lazy cache initializing with room for {} files in `{}`", num_files, &dir.display());
        Ok(Self {
            dir,
            cache: quick_cache::sync::Cache::new(num_files),
        })
    }

    pub fn get_or_fetch<Q>(&self, file_name: &Q) -> Result<std::sync::Arc<String>>
        where
            // Requirements of `self.cache.get_value_or_guard::Q`.
            Q: Hash + Equivalent<String> + ToOwned<Owned = String> + ?Sized,
            // `file_name` must be representable as a Path.
            Q: AsRef<Path> {
        match self.cache.get_value_or_guard(file_name, None) {
            quick_cache::sync::GuardResult::Guard(guard) => {
                let files_path = self.dir.join(file_name);
                Ok(benchmark!(std::format!("Lazy cache reading files {}", files_path.display()), {
                    let file_contents = std::sync::Arc::new(std::fs::read_to_string(self.dir.join(file_name))?);
                    guard.insert(file_contents.clone()).map_err(|_| anyhow!("Failed to insert to files cache"))?;
                    file_contents
                }))
            },
            quick_cache::sync::GuardResult::Timeout =>
                Err(anyhow!("LazyCache::get_or_fetch timed out on query: {}", &file_name.as_ref().display())),
            quick_cache::sync::GuardResult::Value(file) => Ok(file)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_with_non_directory_fails() {
        let result = LazyCache::new(PathBuf::from("/nonexistent/path/that/does/not/exist"));
        assert!(result.is_err());
    }

    #[test]
    fn get_or_fetch_reads_file_contents() {
        let dir = std::env::temp_dir().join("bssg_test_lazy_cache_read");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.html"), "<h1>Hello</h1>").unwrap();

        let cache = LazyCache::new(dir.clone()).unwrap();
        let result = cache.get_or_fetch("test.html").unwrap();
        assert_eq!(*result, "<h1>Hello</h1>");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_or_fetch_returns_cached_value_after_file_changes() {
        let dir = std::env::temp_dir().join("bssg_test_lazy_cache_cached");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("test.html"), "original content").unwrap();

        let cache = LazyCache::new(dir.clone()).unwrap();
        let first = cache.get_or_fetch("test.html").unwrap();
        assert_eq!(*first, "original content");

        // Overwrite the file — the cache should still return the original.
        std::fs::write(dir.join("test.html"), "modified content").unwrap();
        let second = cache.get_or_fetch("test.html").unwrap();
        assert_eq!(*second, "original content");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_or_fetch_missing_file_returns_error() {
        let dir = std::env::temp_dir().join("bssg_test_lazy_cache_missing");
        std::fs::create_dir_all(&dir).unwrap();

        let cache = LazyCache::new(dir.clone()).unwrap();
        let result = cache.get_or_fetch("nonexistent.html");
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}