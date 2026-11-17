# store.py: saves the tags. One database call per batch, however many sessions it has.

SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, tagged_at)        -- insert each row, or replace it if that session is already there
SELECT session_id, tag, now()                                -- the session, its tag, and the time right now
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[]) AS t(session_id, tag)   -- turn the 2 lists into rows: (id1, tag1), (id2, tag2)...
"""


def save_tags(conn, session_tags):                           # session_tags = {session_id: tag} for one batch
    if not session_tags:                                     # nothing to save?
        return                                               # then do nothing

    parameters = {                                           # fill the 2 blanks in the SQL:
        "ids": list(session_tags.keys()),                    # all the session IDs, as a list
        "tags": list(session_tags.values()),                 # all their tags, in the same order
    }

    with conn.cursor() as cursor:                            # open a cursor (closes itself after)
        cursor.execute(SAVE_SQL, parameters)                 # save the whole batch in one call
