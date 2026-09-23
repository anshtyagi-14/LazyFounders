# Trusted Source Registry

This folder has one YAML file per publisher, at `sources/<iso-country>/<key>.yaml`. `npm run sources:sync` loads the files into the database.

- **New entries** start as `trustStatus: PENDING` and `active: false`.
- **Before approving a source:** run `npm run sources:verify -- <key>`, then review the publisher's robots.txt and terms.
- **Approving:** use Admin → Trusted Sources.
- **Syncing** never re-approves or re-activates a source that an editor changed. Setting `trustStatus: SUSPENDED` in YAML always takes effect.

The field reference and the validation rules are in `packages/ingestion-core/src/registry/source-config.ts`. The full onboarding guide is in `docs/pipeline.md`.

## Catalogue

45 sources across India, the US, the UK, Europe, Japan, Korea, China, LatAm, Southeast Asia,
MENA and Africa. 29 are approved and active; the rest stay `PENDING` until their feed and
terms check out.

## Feed verification, 2026-09-23

Every feed URL in the registry was fetched with the crawler user-agent and its robots.txt
read for a wildcard disallow. Results:

**Live and approved** — TechCrunch, The Verge, Ars Technica, Engadget, WIRED, ZDNET, CNBC
(tech + business), Business Insider, Fortune, Axios, MIT Technology Review, Crunchbase News,
SiliconANGLE, Fast Company, Gizmodo, Mashable, TechRadar, BBC (tech + business), The Next Web,
The Decoder, Tech.eu, Sifted, Inc42, YourStory, Entrackr, MediaNama, Mint, THE BRIDGE, TechCabal.

**Still pending, and why:**

| Source | Result |
| --- | --- |
| VentureBeat | `429 Too Many Requests` on every attempt; retry from a server IP before approving. |
| EU-Startups, e27, Moneycontrol, Business Standard | `403` to the crawler user-agent. |
| Analytics India Magazine, Financial Express | Feed path returns an HTML page, not XML. Find the real feed. |
| KrASIA | `200` but zero items. |
| Disrupt Africa | Newest item is from January 2024; the feed looks abandoned. |
| Times of India tech | Feed parses but its items are stale. Check the feed id. |
| ET Tech | Feed returns 51 items; robots.txt and terms not yet reviewed. |
| Startup India, 36Kr, Platum, LatamList, Wamda, Maddyness, deutsche-startups, El Referente, startups.com.br | Not re-verified in this pass. |

Entrackr's feed moved: `/feed/` now 404s, `/rss` works. That URL is fixed in the registry.
