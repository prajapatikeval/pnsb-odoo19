# CLAUDE.md — PNSB Machinery Industries website (Odoo 19 on Render)

Guidance for AI assistants working in this repository. Read it fully before changing code.

## What this is

- Public website for **PNSB Machinery Industries LLP** (Ahmedabad, Gujarat, India): a product
  design, development and manufacturing partner (textile machinery spares, filtration &
  airflow assemblies, mechanical components, precision machined parts, custom fabrication).
  Live at https://pnsb-odoo19.onrender.com. Source material: the client's company profile
  PDFs (VishwakarmaDDM APR22 / MC DETAIL 2020) and an earlier design brief (white theme).
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

1. **No product detail pages.** Products appear only in listings (home showcase, `/products`
   with client-side line filter). Cards must not link to a per-product page.
2. **No fabricated claims** on the live site: no fake testimonials, certifications, founding
   year, customer counts, countries or statistics. Company copy comes from PNSB's own texts
   (company profile; "Machining Excellence, Delivering Reliability.", "Precision ideas. Real
   impact.", Understand → Engineer → Build → Deliver, "Let's discuss your requirement").
   Industries list = the 8 named in the profile only, except that the client replaced Paper
   with Rubber (2026-10).
   The About page text and "What we do" list come from the client's About.docx (2026-10),
   which also gives the founding year (established 2019).
3. **No machine details**: never show machine names, brands, quantities, capacities or specs
   (client instruction). Don't use machine-brand names in product names either.
4. **Only non-private product information**: short generic summaries, no client names,
   drawings or specifications. Contact details shown: address + phones (+ WhatsApp), not the
   personal e-mail addresses or contact names from the PDFs.
5. **Design: "engineering drawing", white theme, must not look AI-generated.** Paper-white sheets,
   1px ink rules, square corners (no pill buttons, no soft shadows/gradients, no rounded card
   grids), monospace technical labels (`.pn-label`, IBM Plex Mono) instead of "eyebrows",
   Archivo headings (font-stretch 80-88%), IBM Plex Sans body, navy ink `#0f1e38`, logo blue
   `#1f52c4`. Drawing-sheet details (zone markers, title blocks) are part of the identity.
   Copy comes from the PDFs and is aimed at US/overseas B2B buyers (US spelling, "Request a
   Quote", IST time zone). Logo = cleaned PNG from the client's JPEG.
10. **3D shows only parts PNSB makes** (company profile): timing pulley, shaft/bearings, chain
   sprocket, mechanical seal, honeycomb air-straightening panel. No generic gears/bolts.
11. **One backend app menu only: "PNSB Machinery"** (owner's request, 2026-10-31) that groups
   the website configuration: Website › Industries / Products / Product Categories, Sales ›
   Quotations / Orders, CRM › Pipeline / Leads, Configuration › Website & Contact Details.
   Except Industries, every entry reuses Odoo's own action (all standard views and filters);
   don't add custom actions or other menus, and keep using base views for product/category fields.
6. **Header has a Log in button** (`/web/login?redirect=/odoo`; "Dashboard" when logged in,
   "My account" for portal users). Keep it.
7. **Never commit secrets.** Passwords come only from Render environment variables.
8. Keep the module name `pnsb_website`: the live database already has it installed.
9. **Use standard Odoo**: products are `product.template` (Sales), enquiries become
   `sale.order` quotations or `crm.lead`. Don't reintroduce custom catalogue/RFQ models.
   The only custom model is `pnsb.industry` (website industries and their pages).

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
5. Module sync via SQL (fast): installs custom addons that aren't installed, the `depends` of
   their manifests (e.g. `sale_management`, `crm`) and `EXTRA_MODULES`; runs
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

Depends on `website`, `sale_management`, `crm` (installing these also pulls `l10n_in`).

Backend:
- `product.template` + fields `pnsb_website_published` ("Show on Website" = the site's publish
  switch; website_sale is not installed), `_sequence`, `_summary`, `_highlight` ("Is Recently
  Developed": home Recent developments, max 6, no fallback), `_story` (optional expandable case
  study); **Website** tab on the product form (groups Website / Home Page); menu Sales ›
  Products › Website Products.
- `product.category` + `pnsb_website_published`, `_sequence`, `_description`, `_top` ("Is Top
  Product Category": home Our Top Products, max `TOP_CATEGORY_LIMIT` = 5 by sequence, only with
  published products; the form warns when a ticked category won't show); categories are
  the website's product lines (`pnsb_website_key` = slug-id used by the filter).
- `pnsb.industry` (models/industry.py): name, sequence, `website_published`, `url_key` (unique,
  slugified; page `/industries/<url_key>`), `icon` (selection of sprite icons), `summary`,
  `description` (HTML page content), `image`, `product_ids` (m2m, inverse
  `product.template.pnsb_industry_ids` shown in the product's Website tab). Records in
  `data/industry_data.xml` (noupdate, the 8 confirmed industries); the Textile industry gets the
  textile spares once per database (`_pnsb_link_industry_products`, marker
  `pnsb_website.industry_products_linked`). Access: users read, sales managers and website
  designers edit. Backend views and actions in `views/industry_views.xml`, menu in
  `views/pnsb_menus.xml`.
- `website` + `pnsb_phone_alt`, `pnsb_whatsapp`, `pnsb_map_lat/lng` (exact workshop location:
  Google Maps link + footer map embed); `_pnsb_layout_values(page)` returns the
  values every page needs (company, address, services, industries, JSON-LD, meta description);
  `_pnsb_bootstrap()` (data/website_setup_data.xml, every install/upgrade) fills company
  name/address/phone/logo, website name/logo/favicon/contacts and `homepage_url = /industrial`,
  only where values are still empty/defaults. Contact details confirmed by the client (address
  350/4 Ahmedabad Udhyogic Vasahat, phones +91 88496 38874 / +91 96246 84555, WhatsApp
  96246 84555) are applied once per database (marker `pnsb_website.contact_version`); bump
  `CONTACT_VERSION` in models/website.py to push new ones.
- `data/product_data.xml` (noupdate): 5 categories, 21 products with photos from the PDFs.
- `migrations/19.0.3.0.0/end-remove_industrial_models.py`: drops the old `industrial_*`
  tables and leftovers of version <= 19.0.2.

Routes (`controllers/main.py`): `/industrial` (home, served on `/`), `/about`, `/services`,
`/industries`, `/industries/<url_key>` (industry page: drawing-sheet hero, optional content and
photo via `/pnsb/industry-image/<id>`, its published products, other industries; in the
sitemap), `/products` (`?line=<key>`), `/contact`, `/contact/thank-you`,
`/pnsb/image/<product_id>/<size>` (public images of published products only; visitors have
no ACL on product.template), `POST /pnsb/enquiry` (CSRF, honeypot `website_url`, max 5 files ×
15 MB, extension whitelist, JSON reply when `Accept: application/json`, redirect otherwise).
Items → `sale.order` draft (origin "Website enquiry"); no items → `crm.lead`. Partner found by
e-mail or created. `user_id` is set explicitly (sudo keeps the public user as env.user).
Old URLs `/quote`, `/contactus`, `/process`, `/work`, `/products/compare`,
`/products/category/*` 301-redirect.

Templates: `website_layout.xml` (icon sprite `#pn-i-*`, `pn_header`, `pn_footer`, product
card, CTA, `pn_layout`, and `pn_odoo_chrome` which renders the PNSB header/footer on Odoo's
own website pages such as /web/login and /my instead of the default "Your Logo" chrome),
`website_home.xml`, `website_pages.xml` (about, services, industries),
`website_products.xml`, `website_contact.xml` (contact form, thank-you, branded 404 via
`http_routing.404` inheritance). PNSB pages set `no_header/no_footer` and render their own
chrome inside `.pn-root`.

Frontend:
- `static/src/scss/pnsb.scss`: all styles, scoped under `.pn-root`.
- `static/src/js/pnsb.js` (bundle, Interactions): `PnsbChrome` (always-visible header, mobile
  menu, enquiry badge/add buttons, back-to-top button, toast), `PnsbCatalog`, `PnsbEnquiryForm`,
  and effects ported from the previous site on one rAF ticker: `PnsbWordFill`
  (`data-pnsb-words`), `PnsbCases` (recent developments: sticky image crossfades to the
  project in view, caption bar).
  `PnsbIndustries` (/industries: big industry list drives a sticky drawing sheet; the row at
  ~40% of the viewport is active, mouse movement or click selects; one fixed quote button).
  **No scroll pinning / scroll-jacking** (the client found pinned sections "stuck").
  Enquiry list in localStorage (`pnsb_enquiry_v1`).
- `static/src/boot/boot.js` (`defer`, outside the bundle): scroll reveals (`.pn-reveal`) and
  masked heading splits (`data-pnsb-split`). Odoo loads the bundle only after `window.load`,
  so anything that hides content must live here (CSS failsafe shows it after 3 s otherwise).
- `static/src/three/pnsb3d.js` (native ES module, dynamically imported so it never delays
  `load`) + vendored `static/lib/three/three.module.min.js` (three.js r160, MIT). Scenes on
  `[data-pnsb-3d]`: `turntable` (home hero: PNSB's parts, auto-advances, drag to rotate, part
  list `[data-pnsb-part]`), `process` (how we work, driven by clickable auto-playing
  `[data-pnsb-step]` items), `seal`, `sprocket`, `honeycomb`, `pulley`. The fallback photo is
  shown only with `html.pn-no3d` / without JS (never flashes on load); a "Loading 3D model"
  line shows meanwhile. Procedural geometry, studio env
  map, renders only while visible, skipped in iframes (website builder) and without WebGL.
- `static/src/map/pnsb_map.js` (`defer`, Contact page only) + vendored
  `static/lib/leaflet/` (Leaflet 1.9.4, BSD-2): "Visit us" map with OpenStreetMap tiles
  (greyscale via CSS), brand pin, info card and Google Maps directions; Leaflet is fetched only
  when the map nears the viewport. Scroll-zoom is enabled only after a click; no drag on touch.
- Scripts outside the bundle get content-hashed URLs via `website._pnsb_static_url()`.

## Odoo 19 / tooling pitfalls learned the hard way

- **QWeb drops attributes whose value is `0`**: `t-att-data-x="index"` vanishes for index 0. Use
  `t-attf-data-x="#{index}"`.
- **libsass 3.6** compiles the SCSS: no Sass-conflicting `min()`/`max()` with mixed units, no
  space-separated `rgb(0 0 0 / 50%)` (use `rgba()`); `clamp()`, `color-mix()`, `:has()` are fine.
- **Edit mode**: only interactions registered in `public.interactions.edit` run in the website
  builder. Every interaction's `destroy()` must undo its DOM changes (split text restored,
  `is-in`/`is-split` removed, inline styles cleared) or they get saved into the page. Hidden
  "reveal" states only apply under `html.ip-motion`.
- Reveal hidden states only apply under `html.pn-motion`, which the layout never sets inside
  an iframe (website builder), and `PnsbReveal.destroy()` removes `pn-shown`.
- Visitors' 404s render `http_routing.404` directly; `website.page_404` is only used for
  website designers. Override the former.
- Colibri calls `updateContent()` after every handled event: use `.noUpdate` for scroll/keydown.
- Headless Edge/Chrome `--screenshot` doesn't write a file for HTTP 404 responses, and headless
  windows have a ~500px minimum width (use DevTools device emulation for phone captures).
- Odoo's theme CSS forces `section { height: auto !important }` below 768px: use `min-height`
  for scroll-driven sections.
- `data-pnsb-3d` maps to `dataset["pnsb-3d"]` (a dash before a digit is not camel-cased): use
  `getAttribute`.
- `pn-split` is the two-column layout class; the word-split effect uses `pn-splitw`.
- The Website app shows the site in an iframe: 3D and animations must run there; only edit
  mode (`body.editor_enable`, or `?enable_editor=1` on load) switches them off.
- External links (WhatsApp, Google Maps) always use `target="_blank" rel="noopener"`.
- In the test helpers, never `pkill -f odoo-bin` from a shell whose own command line contains
  that string (it kills itself); run the script file directly.
- A `backdrop-filter` on the header traps fixed children: the mobile menu panel is rendered
  outside `<header>`.
- The 19.0.3.0.0 migration must not delete external ids Odoo still needs: `_process_end` runs
  after `end-` scripts and finds the old menus/views/groups through them.
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

Checks worth running after changes: routes `/ /about /services /industries /products /contact
/web/login` return 200, an unknown URL returns the branded 404, `/web/health` 200, frontend CSS
bundle 200, `select count(*) from ir_attachment where store_fname is not null` stays 0, an
enquiry with products creates a draft `sale.order` (with the drawing attached) and one without
products creates a `crm.lead`. Validate XML (`python3 -c "import xml.dom.minidom as m; m.parse(file)"`) and Python
(`python3 -m py_compile`) before pushing — a failed module update blocks the Render deploy.

## Known gaps / TODO

- Website-editor edit mode was not verified end to end.
- Outgoing mail server not configured, so quotations can't be e-mailed from Odoo yet.
- Free plan limits (sleep, 30-day DB): recommend a paid plan for production.
- The git history before commit `2a72822` contains an old, now unused master password; rewrite
  history if that matters.
- Backup of the previous (dark/orange, custom-model) version: branch
  `backup/2026-10-13-before-redesign`, tag `backup-2026-10-13-before-redesign`.
