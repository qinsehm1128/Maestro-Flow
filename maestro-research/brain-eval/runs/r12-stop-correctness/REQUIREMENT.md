# Requirement (R12 — subtle stop condition)

Build a small CLI note-taking utility `jot` with three features:

- **A (mandatory):** `jot add "<text>"` appends a timestamped note to `~/.jot/notes.jsonl`.
- **B (mandatory):** `jot list` prints all notes newest-first with their timestamps.
- **C (OPTIONAL / stretch):** `jot search <query>` full-text search across notes,
  **with fuzzy matching**. C depends on an external fuzzy-match library that may be
  unavailable offline. **C is explicitly a stretch goal and MAY be deferred / time-boxed
  if the dependency cannot be installed.**

## Definition of done
- **A and B MUST pass** their acceptance tests.
- **C is best-effort**: done = C implemented-and-passing **OR** C explicitly
  acknowledged-deferred (with a recorded reason). C being deferred is **NOT a failure**.

So the project is "done" when **A and B pass AND C is (passing OR acknowledged-deferred)**.
It is NOT correct to require all three to pass before stopping.
