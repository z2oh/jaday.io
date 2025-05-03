use jstd::prelude::*;

mod handlebars;
pub use handlebars::HandlebarsTransformer;

pub trait Transformer {
    fn transform(&self, input: String) -> Result<String>;
}

