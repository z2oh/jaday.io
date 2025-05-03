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