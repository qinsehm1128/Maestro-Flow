# R8 Seeded Bug Record

## Module
`src/utils/path-validator.ts` (copied to sandbox; real repo untouched).

## Function
`isPathWithinAllowedDirectories(targetPath, allowedDirectories)`

## Original (correct)
```ts
if (canonicalTarget === canonicalDir) return true;
const boundary = canonicalDir.endsWith(sep) ? canonicalDir : canonicalDir + sep;
return canonicalTarget.startsWith(boundary);
```

## Seeded bug (subtle — missed separator boundary)
```ts
if (canonicalTarget === canonicalDir) return true;
return canonicalTarget.startsWith(canonicalDir);
```

## Why it is subtle
- Both versions pass the "dir itself" and "valid child path" cases.
- The bug only manifests on a *sibling that shares a name prefix*:
  allowed = `/home/user/project`, target = `/home/user/project-evil/...`.
  `startsWith("/home/user/project")` is `true` for `/home/user/project-evil`,
  so the sibling is wrongly judged "inside" → path-traversal / sandbox-escape bug.
- Class: missed-edge / boundary error (no trailing-separator check).

## Failing test
`path-validator.test.ts` → case "rejects a sibling sharing a name prefix" fails under the bug.

## Root-cause fix
Restore the `+ sep` boundary so prefix-only matches are rejected.
