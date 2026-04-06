use jstd::prelude::*;

use serde::Serialize;

pub struct HandlebarsTransformer<'a, Ctx: Serialize> {
    reg: handlebars::Handlebars<'a>,
    ctx: &'a Ctx,
}

impl<'a, Ctx: Serialize> crate::builder::transformers::Transformer for HandlebarsTransformer<'a, Ctx> {
    fn transform(&self, input: String) -> Result<String> {
        Ok(self.reg.render_template(&input, &self.ctx)?)
    }
}

impl<'a, Ctx: Serialize> HandlebarsTransformer<'a, Ctx> {
    pub fn new(ctx: &'a Ctx) -> Self {
        Self { reg: handlebars::Handlebars::new(), ctx }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builder::transformers::Transformer;
    use serde_json::json;

    #[test]
    fn passthrough_with_no_template_variables() {
        let ctx = json!({});
        let t = HandlebarsTransformer::new(&ctx);
        let result = t.transform("<h1>Hello</h1>".to_string()).unwrap();
        assert_eq!(result, "<h1>Hello</h1>");
    }

    #[test]
    fn substitutes_variable_from_context() {
        let ctx = json!({ "name": "world" });
        let t = HandlebarsTransformer::new(&ctx);
        let result = t.transform("<h1>Hello {{name}}</h1>".to_string()).unwrap();
        assert_eq!(result, "<h1>Hello world</h1>");
    }

    #[test]
    fn missing_variable_renders_empty() {
        let ctx = json!({});
        let t = HandlebarsTransformer::new(&ctx);
        let result = t.transform("{{missing}}".to_string()).unwrap();
        assert_eq!(result, "");
    }

    #[test]
    fn invalid_template_returns_error() {
        let ctx = json!({});
        let t = HandlebarsTransformer::new(&ctx);
        // Unclosed block tag is a template parse error.
        let result = t.transform("{{#if true}}no closing tag".to_string());
        assert!(result.is_err());
    }
}