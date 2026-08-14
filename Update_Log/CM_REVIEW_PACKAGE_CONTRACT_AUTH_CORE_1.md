# CM_REVIEW_PACKAGE_CONTRACT_AUTH_CORE_1

Adds the provider-neutral Review Package contract, ZIP serializer/parser,
validation modes, digest helper, two-phase submission transport seam and a
generic review identity settings component. The change does not bind an
endpoint, provider, cloud resource, OAuth client, repository or production
approval path.

Applications register their own package profile and authentication port.
Legacy package import remains a compatibility operation; formal submission is
strict and requires the current package marker.
