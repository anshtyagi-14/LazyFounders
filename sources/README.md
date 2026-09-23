# Trusted Source Registry

This folder has one YAML file per publisher, at `sources/<iso-country>/<key>.yaml`. `npm run sources:sync` loads the files into the database.

- **New entries** start as `trustStatus: PENDING` and `active: false`.
- **Before approving a source:** run `npm run sources:verify -- <key>`, then review the publisher's robots.txt and terms.
- **Approving:** use Admin → Trusted Sources.
- **Syncing** never re-approves or re-activates a source that an editor changed. Setting `trustStatus: SUSPENDED` in YAML always takes effect.

The field reference and the validation rules are in `packages/ingestion-core/src/registry/source-config.ts`. The full onboarding guide is in `docs/pipeline.md`.

## Starter catalogue

The starter catalogue covers 24 sources across India, Japan, the US, Europe, LatAm, Southeast Asia, China, Korea, MENA and Africa. Its feed URLs are best-known values, and each one must be verified before approval.
