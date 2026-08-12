# Azure Container Apps deployment

## Compliance prerequisite

Do not publicly or commercially deploy until Discogs confirms the intended hosted use,
redistribution, attribution, comparison, caching, and marketplace behavior. Keep both marketplace
feature flags and all cache TTLs at zero unless the approval explicitly permits them.

## Provision

Install Azure CLI/Bicep and Docker, select a subscription, and export credentials only in the local
protected environment:

```bash
export DISCOGS_TOKEN='...'
./scripts/bootstrap/provision.sh dev eastus
```

The two-pass bootstrap provisions shared resources, stores separate caller API-key and Discogs-token
secrets in Key Vault, builds an immutable image, and creates the app only after both secrets exist.
Neither secret is placed in source, Bicep parameters, image layers, or command output.

Set `discogsUserAgent` to an application identity and monitored contact before production. The
default placeholder is not suitable for deployment.

## Runtime policy

The Container App uses a user-assigned managed identity for ACR and Key Vault, HTTPS-only ingress,
an unprivileged container, health probes, Log Analytics, and Application Insights. Maximum replicas
defaults to one because the outbound Discogs request budget is process-local. Add a distributed
limiter before horizontal scaling.

Caller API keys and the Discogs token rotate independently. Key Vault references are versionless;
create a new revision or restart replicas after rotation. Alert on Discogs 401 responses, sustained
429 responses, low remaining quota, and retry exhaustion.
