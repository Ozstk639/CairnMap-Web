# Review Package Contract

`cairnmap.review-package.v1` is the versioned content contract for a review
relay ZIP. It is independent from runtime feature schemas, release manifests,
project configuration and provider-owned review state.

The core accepts a local `ReviewPackageProfile` that declares only package
layout. Applications own profiles, API routes, provider configuration and
runtime-data mappings. The core never embeds a cloud endpoint, repository,
domain, credentials or a production approval implementation.

## Validation modes

| Mode | Intended use | Legacy package behavior |
| --- | --- | --- |
| `compat-import` | Local Mapping import and temporary Review preview | Missing current markers are warnings. |
| `normalize-on-export` | Re-exporting an imported legacy package | Legacy fields may be read, then a new artifact is emitted. |
| `strict-submission` | Creating a review submission | Requires current marker, counts and fully located deletes. |
| `strict-execution` | Provider-owned preflight or release execution | Uses the same strict artifact rules without a compatibility bypass. |

`Review.json` is a content marker only. It must declare a pending submission;
approval, reviewer identity, precheck outcomes, history and release state are
server-owned and are rejected by strict validation.

The core normalizer can enrich a legacy delete marker with an application-
provided location only when the ID resolves uniquely. Ambiguous or missing
locations remain incomplete and strict submission rejects them; the core never
guesses a destructive target.

`INDEX.json` may include `sourceSnapshot` for warning/reporting only. The
current authoritative release and any execution lock remain provider-owned.
