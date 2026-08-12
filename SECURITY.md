# Security

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not
open a public issue for an undisclosed vulnerability.

Deployments must enable caller authentication and keep API keys and the Discogs token in a secret
manager. Never expose the Discogs token through logs, OpenAPI, tool results, or container images.
Marketplace features and caching must remain disabled until the deployment has the necessary
Discogs approval. Review dependency, container, and compliance findings before release.
