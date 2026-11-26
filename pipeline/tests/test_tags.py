# test_tags.py: checks the tagging rules in pipeline/tags.py on small made-up sessions (no database, no real data). Run from the repo root: python -m unittest discover -s pipeline/tests (or just test)

import unittest

from pipeline import tags


def events(*items, app_events=1):   # Builds the dict tags.py receives: each item is an event name, or (name, phase, state). Called by every test below
    rows = [item if isinstance(item, tuple) else (item, None, None) for item in items]
    return {
        "event_names": [name for name, _, _ in rows],
        "phases": [phase for _, phase, _ in rows],
        "states": [state for _, _, state in rows],
        "app_events": app_events,
    }


class SessionRules(unittest.TestCase):   # Session tag and reason, the same order of rules as pipeline/tags.py
    def check(self, session, tag, reason):   # Asserts the tag and the reason for one made-up session. Called by each test
        self.assertEqual(tags.tag_session(session), tag)
        self.assertEqual(tags.failure_reason(session, tag), reason)

    def test_success_after_a_failure_is_connected(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("pipeline.connect.failure", "pre-connect", None), "pipeline.connect.success"), "connected", None)

    def test_no_attempt(self):
        self.check(events("host_connected", "client_connected"), "no_attempt", None)

    def test_pre_connect_failure_is_setup_error(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("pipeline.connect.failure", "pre-connect", None)), "failed", "setup_error")

    def test_last_failure_phase_wins(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("pipeline.connect.failure", "pre-connect", None),
                          ("pipeline.connect.failure", "connecting", None)), "failed", "error_while_connecting")

    def test_failed_video_state(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("webrtc.connection.state", "connecting", "failed")), "failed", "video_connection_failed")

    def test_host_never_joined(self):
        self.check(events("client_connected", "pipeline.connect.attempt"), "failed", "someone_never_joined")

    def test_no_evidence_falls_back_to_no_video(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt"), "failed", "no_video")


class ConnectionRules(unittest.TestCase):   # Client connection tag and reason
    def test_connected(self):
        connection = events("pipeline.connect.success")
        self.assertEqual(tags.tag_connection(connection), "connected")

    def test_no_app_events_is_unknown(self):
        connection = events("client_connected", app_events=0)
        self.assertEqual(tags.tag_connection(connection), "unknown")

    def test_not_connected_without_evidence_is_no_video(self):
        connection = events("client_connected", "ws.connect")
        self.assertEqual(tags.tag_connection(connection), "not_connected")
        self.assertEqual(tags.failure_reason(connection, "not_connected"), "no_video")

    def test_missing_host_is_not_someone_never_joined_for_a_connection(self):
        connection = events("pipeline.connect.attempt")
        self.assertEqual(tags.failure_reason(connection, "not_connected"), "no_video")


if __name__ == "__main__":
    unittest.main()
