# store.py: saves the tags. One database call per batch, however many sessions it has.

# UPSERT = insert the row, or replace it if that session is already there,
# so running the pipeline twice never makes duplicates.
# unnest() turns the two lists into rows: (id1, tag1), (id2, tag2), ...
SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, tagged_at)
SELECT session_id, tag, now()
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[]) AS t(session_id, tag)
"""


def save_tags(conn, session_tags):
    if not session_tags:
        return

    parameters = {
        "ids": list(session_tags.keys()),
        "tags": list(session_tags.values()),
    }

    with conn.cursor() as cursor:
        cursor.execute(SAVE_SQL, parameters)
