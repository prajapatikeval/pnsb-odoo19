# CLAUDE.md — PNSB Machinery Industries website (Odoo 19 on Render)

Guidance for AI assistants working in this repository. Read it fully before changing code.

## What this is

- Public website + light backend for **PNSB Machinery Industries** (Ahmedabad, Gujarat, India):
  precision machinery and engineered components (bolts, nuts, washers, rods, structural
  sets, CNC parts). Live at https://pnsb-odoo19.onrender.com.
- Odoo **19.0** (official `odoo:19.0` Docker image), one custom addon: `addons/pnsb_website`.
- Hosted on **Render** (free plan: 0.1 CPU, 512 MB RAM, disk wiped on every restart/deploy,
  service sleeps after 15 min idle, free PostgreSQL expires after 30 days).
- Deploys automatically on every push to `main` (Render Blueprint = `render.yaml`).

```
addons/pnsb_website/   the website module (technical name must stay "pnsb_website")
docker/boot.py         boot manager: config, DB init, module sync, admin password, then exec odoo
Dockerfile             FROM odoo:19.0; addons copied to /opt/pnsb/addons
render.yaml            Render web service + PostgreSQL (pnsb-db)
docker-compose.yml     local replica of Render (web limited to 512 MB)
README.md              human deployment guide
```

## Hard rules (the owner asked for these)

1. **No product detail pages.** Products appear only in listings (home featured stack,
   `/products`, `/products/category/<slug>`, `/products/compare`). Product cards must not link
   to a per-product page; `industrial.product.website_url` points to the category page.
2. **No fabricated claims** on the live site: no fake testimonials, certifications (ISO/IATF…),
   founding year, customer counts, countries or defect rates. Home stats are computed from real
   data (counts of product families, categories, materials, finishes). Company copy comes from
   PNSB's own texts ("Precision. Built for industry.", Understand → Engineer → Build → Deliver,
   "Let's discuss your requirement", "Let's build something precise").
3. **Keep the design system** (dark graphite + forge orange `#ff5b1f`, Archivo / Geist / Geist Mono,
   double-bezel cards, pill buttons with nested icon). Do not replace with Bootstrap defaults.
4. **Header has a Log in button** (`/web/login?redirect=/odoo`; shows "Dashboard" when logged in,
   "My account" for portal users). Keep it.
5. **Never commit secrets.** Passwords come only from Render environment variables.
6. Keep the module name `pnsb_website`: the live database already has it installed; renaming would
   leave an orphan module and force a reinstall.

## Render / boot architecture (why it looks like this)

The previous setup failed with timeouts and "cursor already closed" errors: on 0.1 CPU, installing
modules or creating databases inside a web request takes minutes, the proxy/health check gives up
and Render restarts the container mid-transaction. `docker/boot.py` fixes this. On every start it:

1. Starts a tiny placeholder HTTP server on `$PORT` (200 on `/web/health`, 503 "getting ready" page
   elsewhere) so Render's health check (`healthCheckPath: /web/health`) passes immediately.
2. Writes `/var/lib/odoo/odoo.conf` from env vars: `list_db = False`, `dbfilter = ^<DB_NAME>$`,
   `proxy_mode = True`, `workers = 0` (threaded, websockets on one port), `db_maxconn = 16`.
3. Waits for PostgreSQL; if the DB is empty, runs `odoo -i base --stop-after-init`.
4. Once per database: sets `ir_attachment.location = db`, deletes attachment rows whose files are
   gone, and `force_storage()`. All attachments live in PostgreSQL because the disk is ephemeral.
5. Module sync via SQL (fast): installs custom addons that aren't installed plus `EXTRA_MODULES`; runs
   `-u` on custom addons only when the sha256 of `/opt/pnsb/addons` differs from the stored
   `pnsb.boot.addons_hash` parameter. Unchanged deploys boot in ~10–20 s.
6. Applies `ADMIN_PASSWORD` to the admin user (via passlib pbkdf2_sha512) when it changes (marker in
   `pnsb.boot.admin_marker`); optional `ADMIN_LOGIN` renames the admin login.
7. Shuts the placeholder and `exec`s `odoo -c /var/lib/odoo/odoo.conf`.

State kept in `ir_config_parameter`: `pnsb.boot.storage`, `pnsb.boot.addons_hash`,
`pnsb.boot.admin_marker`, `pnsb.boot.reset_done`.

Environment variables: `DB_HOST/PORT/USER/PASSWORD/NAME`, `PORT`, `ADMIN_PASSWORD`,
`ADMIN_LOGIN`, `MASTER_PASSWORD`, `EXTRA_MODULES` (comma separated apps installed at boot),
`RESET_DATABASE=YES_DELETE_EVERYTHING` (wipes the DB once; remove afterwards), `ODOO_WORKERS`.

Operational answers:
- **Install another Odoo app**: add it to `EXTRA_MODULES` in Render and redeploy. Avoid
  Apps › Install on the free plan (can still time out for big apps).
- **New database from the UI**: intentionally impossible (database manager disabled, one Render DB).
  Use `RESET_DATABASE` to start over.
- **Admin login**: user `admin`, password = `ADMIN_PASSWORD` in Render's Environment tab.
- Addons are in **/opt/pnsb/addons, not /mnt/extra-addons**: the base image declares
  `/mnt/extra-addons` as a VOLUME, which kept serving stale code after rebuilds.

## Module map (`addons/pnsb_website`)

Backend models (menu **Industrial Parts**):
- `industrial.product.category`, `industrial.product` (+ `.spec`, `.size`, `.image`),
  `industrial.material`, `industrial.finish`, `industrial.sector` — catalogue; images via
  `industrial.image.source` (uploaded image or `image_url` fallback, `_ip_image_src(width)`).
- `industrial.rfq` / `industrial.rfq.line` — quote requests (kanban pipeline, chatter, drawings as
  attachments, sequence `RFQ/%(year)s/`, acknowledgement mail template).
- `website._pnsb_bootstrap()` — idempotent setup (company name/address, website name,
  `homepage_url = /industrial`), called by `post_init_hook` and `data/website_setup_data.xml` on
  every install/upgrade; only overwrites untouched Odoo defaults.
- Security: groups *Industrial Parts › User / Administrator*; public/portal read access with record
  rules limited to published records.

Routes (`controllers/main.py`): `/industrial` (home, served on `/` via `homepage_url`), `/products`,
`/products/category/<slug>`, `/products/compare?ids=`, `/quote`, `POST /quote/submit` (multipart,
CSRF, honeypot `company_website`, max 6 files × 15 MB, extension whitelist), and 301 redirects
`/about`, `/process`, `/contact`, `/contactus`.

Templates: `views/website_layout_templates.xml` (layout, icon sprite `#ip-i-*`, header, menu,
footer, basket drawer, compare tray), `website_home_templates.xml`, `website_catalog_templates.xml`,
`website_compare_templates.xml`, `website_quote_templates.xml`. All site CSS is scoped under
`.ip-root`; pages set `no_header/no_footer` and render their own chrome.

Frontend JS (Odoo 19 **Interaction** framework, `@web/public/interaction`, registered in
`registry.category("public.interactions")`):
- `static/src/boot/boot.js` — loaded with `defer` outside the bundle (Odoo loads
  `web.assets_frontend_lazy` only after `window.load`, i.e. after all images). Runs the preloader,
  page-enter curtain, text splitting and scroll reveals as soon as the DOM is parsed.
- `js/core/motion.js` (shared rAF ticker, inertial wheel scroll, `motion.scrollTo`),
  `split.js`, `store.js` (quote basket + compare in localStorage), `prism.js` (3D hex prism shading).
- `js/interactions/`: `root.js` (smooth scroll, header hide/show with hysteresis, menu, cursor,
  magnetic buttons, anchors, page transitions, toasts), `reveal.js`, `scrub.js` (hero, parallax,
  word fill), `sections.js` (pinned category rail, stacking cards, marquee, 3D nut-on-bolt process,
  materials explorer, industries hover image, torque calculator), `commerce.js`, `catalog.js`,
  `quote.js` (compare page + multi-step RFQ).
- SCSS: `tokens.scss` (CSS variables + mixins, must stay first), `base`, `components`, `chrome`,
  `home`, `catalog`, `product` (compare table styles), `quote`.

## Odoo 19 / tooling pitfalls learned the hard way

- **QWeb drops attributes whose value is `0`**: `t-att-data-x="index"` vanishes for index 0. Use
  `t-attf-data-x="#{index}"`.
- **libsass 3.6** compiles the SCSS: no Sass-conflicting `min()`/`max()` with mixed units, no
  space-separated `rgb(0 0 0 / 50%)` (use `rgba()`); `clamp()`, `color-mix()`, `:has()` are fine.
- **Edit mode**: only interactions registered in `public.interactions.edit` run in the website
  builder. Every interaction's `destroy()` must undo its DOM changes (split text restored,
  `is-in`/`is-split` removed, inline styles cleared) or they get saved into the page. Hidden
  "reveal" states only apply under `html.ip-motion`.
- Don't reuse the class `is-in` for anything else (reveal cleanup strips it everywhere).
- Colibri `dynamicContent`: use `.noUpdate` on high-frequency events (`t-on-pointermove.noUpdate`),
  `.capture`, `.prevent` modifiers exist; handlers are wrapped async but run synchronously first.
- Never pass `main_object=None` to `website.layout` (500 error); omit the key instead.
- CSS `filter` on a `preserve-3d` element flattens the 3D prism; `backdrop-filter` or
  `position: fixed` parents capture fixed children (dropdowns inside the sticky filter bar).
- Avoid animating `max-width`, full-screen `backdrop-filter`/`clip-path`, or `mix-blend-mode` layers
  — they caused scroll/menu lag. Animate `transform`/`opacity` only.
- `--dev=xml` makes every page take ~3 s server-side; measure speed without it.

## Local development & testing

```bash
docker compose up --build
```
Site on http://localhost:10000, admin password `change-me-locally` (local only). After code
changes `docker compose up -d --build` is enough (boot upgrades the module when the hash changes);
use `docker compose down -v` to reset the local database.

Checks worth running after changes: routes `/ /products /quote /products/compare /web/login` return
200, `/web/health` 200, frontend CSS bundle 200, `select count(*) from ir_attachment where
store_fname is not null` stays 0, a quote submission creates an `industrial.rfq` with lines and
attachments. Validate XML (`python3 -c "import xml.dom.minidom as m; m.parse(file)"`) and Python
(`python3 -m py_compile`) before pushing — a failed module update blocks the Render deploy.

## Known gaps / TODO

- Website-editor edit mode was not verified end to end after the last changes.
- Sample catalogue entries (14 families) and Pexels stock photos are placeholders; replace with real
  products/photos (or unpublish) in the backend.
- Outgoing mail server not configured: RFQ acknowledgement e-mails stay queued.
- Free plan limits (sleep, 30-day DB) — recommend a paid plan for production.
- The git history before commit `a57655d` contains an old, now unused master password; rewrite
  history if that matters.
