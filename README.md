# Test Project
# DB Pooling

Idle connections are now reaped on a timer and the pool max size is
configurable via `DB_POOL_MAX`, addressing the exhaustion under load
tracked in #14.
