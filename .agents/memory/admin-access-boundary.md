---
name: Admin access boundary
description: Authentication and authorization scope for the mystery shopper MVP.
---

The initial milestone focuses on admin workflows and prepares user-role data, but it does not implement sign-in or server-side authorization. Do not treat the static admin label or role column as access protection. Add supported authentication and enforce admin permissions in the API before exposing these operations publicly.

**Why:** The brief prioritizes the first admin workflows and explicitly rejects fake security based on hiding UI controls.

**How to apply:** Any future auth milestone must protect API routes as well as the interface; role data alone is not authorization.
