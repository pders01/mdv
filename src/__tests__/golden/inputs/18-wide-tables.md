# Wide-table stress fixtures

These tables intentionally exceed common desktop widths. Use them to check natural column sizing, horizontal overflow, and readability at viewport widths around 1280, 1920, and 3840 CSS pixels. The TUI fixture should also be tested at 120, 160, and 240 columns.

## Many moderately wide columns (roughly 220+ terminal cells)

| Service name | Deployment region | Runtime version | Database engine | Availability zone | Release channel | Primary owner | Incident contact | Last deployment | Current status | Replication mode | Data residency |
|---|---|---|---|---|---|---|---|---|---|---|---|
| customer-profile-api | us-west-2 production | Node.js 22.14 LTS | PostgreSQL 16.8 | us-west-2b / us-west-2c | stable production | Customer Platform Team | customer-platform-oncall | 2026-05-14 09:42 UTC | healthy and serving | synchronous multi-zone | United States |
| billing-event-processor | eu-central-1 production | Java 21.0.6 LTS | MariaDB 11.4 LTS | eu-central-1a / eu-central-1b | gradual rollout | Revenue Infrastructure | revenue-infra-oncall | 2026-05-13 18:07 UTC | degraded, investigating | asynchronous cross-region | European Union |
| search-index-maintainer | ap-southeast-2 staging | Python 3.13.2 | OpenSearch 2.19 | ap-southeast-2a | candidate build 2026.05 | Discovery Engineering | discovery-primary-oncall | 2026-05-12 03:26 UTC | scheduled maintenance | snapshot-based recovery | Australia |

## Long unbreakable values (should force actual horizontal overflow on web)

| Artifact | Registry path | Commit identifier | Build provenance | Verification result |
|---|---|---|---|---|
| web-client | registry.example.internal/platform/customer-experience/web-client/releases/2026/05/14/web-client-production-image | sha256:8c20e9f1d3a761b55c9d4ef083a2107b8c20e9f1d3a761b55c9d4ef083a2107b | https://provenance.example.internal/attestations/platform/customer-experience/web-client/2026/05/14/build-18427/production/release-candidate | signature-valid; policy-approved; vulnerability-scan-clean |
| search-worker | registry.example.internal/platform/discovery/search-index-maintainer/releases/2026/05/12/search-worker-staging-image | sha256:4d71aa9c3b8f206e17d45ab963ce107f4d71aa9c3b8f206e17d45ab963ce107f | https://provenance.example.internal/attestations/platform/discovery/search-index-maintainer/2026/05/12/build-9231/staging/verified | signature-valid; policy-approved; vulnerability-scan-clean |

## Mixed short and verbose cells (record layout stress)

The Description field is deliberately much longer than the other cells, while IDs, status values, and optional values stay short or empty. Check that record-style layouts keep all of each value readable without wasting the entire row on the longest cell.

| ID | Component | Description | Owner | Status | Optional note |
|---|---|---|---|---|---|
| 17 | auth | Handles browser sign-in using OAuth 2.1, rotating refresh tokens, device-bound sessions, and a staged migration path that keeps existing customer sessions valid while old credentials are retired. | Identity Platform | active | |
| 23 | billing | Reconciles delayed payment events against the immutable ledger, retries transient provider failures with bounded exponential backoff, and emits an audit trail that support engineers can inspect without replaying the original transaction. | Revenue Systems | degraded | follow-up at 14:00 UTC |
| 31 | search | Rebuilds stale indexes from the event log while preserving query availability; the worker limits concurrent shard moves and reports progress with enough detail to diagnose slow partitions. | Discovery | planned | |
