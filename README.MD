## [jaday.io](https://jaday.io)

Repository layout:
  - `/tools/bssg` - bespoke static site generator for [jaday.io](https://jaday.io)
  - `/www` - web content for [jaday.io](https://jaday.io)

`.github/deploy.yml` triggers on pushes to `main` and builds and runs `/tools/bssg` to generate the site from the sources in `/www`. The built site is then pushed to the `gh-pages` branch, where it is deployed by GitHub pages and accessible at [jaday.io](https://jaday.io).
