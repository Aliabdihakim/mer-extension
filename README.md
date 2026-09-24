# Meritio – Chrome extension

Source code of the Meritio browser extension: a Chrome side panel and review overlay that tailors your CV to the
job ad you are reading on Platsbanken or Indeed. See https://www.meritiocv.se.

This repository is published under the **GNU AGPL-3.0** (see `LICENSE`) because the extension embeds
[SuperDoc](https://superdoc.dev), an AGPL-licensed DOCX editor, for the in-browser review of your CV.

The Meritio backend service the extension talks to (accounts, CV analysis, document generation, billing) is
proprietary and not part of this repository. Building this extension gives you the client; using it requires a
Meritio account.

## Build

Requires Node 22.

```bash
npm install
npm run build          # builds shared types, then extension/dist
```

Load `extension/dist` as an unpacked extension in `chrome://extensions` (Developer mode → Load unpacked).

`extension/.env.production` points the build at the production API and website. For a local backend, create
`extension/.env.development` with `VITE_API_BASE` and `VITE_SITE_URL` and run `npm run dev -w extension`.

## Layout

```
shared/      TypeScript types shared with the backend
extension/   Manifest V3 extension: content scripts, side panel, review overlay (SuperDoc)
```

## Third-party notices

- SuperDoc – AGPL-3.0 – https://github.com/superdoc-dev/superdoc
- Carlito, Caladea (SIL OFL) and Liberation fonts (SIL OFL) in `extension/public/fonts`
