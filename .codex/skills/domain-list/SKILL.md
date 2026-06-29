---
name: domain-list
description: List registered domain terms from glossary
argument-hint: "[--tier core|extended|peripheral]"
allowed-tools: Read, Bash, Glob, Grep
---

<purpose>
List all registered domain terms from `.workflow/domain/glossary.yaml`. Shows canonical name, definition, tier, aliases, and status.
</purpose>

<execution>

### Step 1: Load Glossary

Read `.workflow/domain/glossary.yaml`. If not exists, report "No domain glossary — run `maestro domain init`".

### Step 2: Filter and Display

Apply optional `--tier` filter. Display terms grouped by tier (core → extended → peripheral):

```
=== DOMAIN TERMS ({N} total) ===

[core]
  auth-token — Short-lived credential for API authentication
    aliases: 令牌, access-token | keywords: auth, credential, jwt
  event-bus — Central pub-sub message broker
    aliases: 事件总线 | keywords: pubsub, messaging

[extended]
  ...

[deprecated]
  wikiindexer → search-engine (successor)
```

</execution>
