## [jaday.io](https://jaday.io)

Repository layout:
  - `/tools/bssg` - bespoke static site generator for [jaday.io](https://jaday.io)
  - `/www` - web content for [jaday.io](https://jaday.io)

`.github/workflows/deploy.yml` triggers on pushes to `main`. This workflow runs `cargo run` in the `/tools/bssg` directory to generate the site from the sources in `/www`. The built site is then pushed to the `gh-pages` branch, where it is deployed by GitHub pages and accessible at [jaday.io](https://jaday.io).
