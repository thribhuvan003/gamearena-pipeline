# test_tags.py: checks the rules in pipeline/tags.py on small made-up sessions (no database). Run: just test

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

    def test_failed_network_state(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("ice.connection.state", "connecting", "failed")), "failed", "network_connection_failed")

    def test_network_state_not_failed_is_ignored(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("ice.connection.state", "connecting", "disconnected")), "failed", "no_video")

    def test_video_decode_error(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt", "media.decode.error"), "failed", "video_decode_error")

    def test_connection_dropped(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt", "pipeline.connection.dropped"), "failed", "connection_dropped")

    def test_video_state_comes_before_network_state(self):
        self.check(events("host_connected", "client_connected", "pipeline.connect.attempt",
                          ("ice.connection.state", "connecting", "failed"),
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

    def test_connection_with_failed_network_state(self):
        connection = events("client_connected", ("ice.connection.state", "connecting", "failed"))
        self.assertEqual(tags.failure_reason(connection, "not_connected"), "network_connection_failed")

    def test_missing_host_is_not_someone_never_joined_for_a_connection(self):
        connection = events("pipeline.connect.attempt")
        self.assertEqual(tags.failure_reason(connection, "not_connected"), "no_video")



class ClientLabels(unittest.TestCase):   # Device, OS, browser and access from made-up user agents, in the same order as pipeline/tags.py
    def test_edge_on_windows_desktop(self):
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0"
        self.assertEqual(tags.client_labels(True, ua, "external"), ("Desktop", "Windows", "Edge", "external"))

    def test_android_phone_vs_tablet(self):
        self.assertEqual(tags.client_labels(True, "Linux; Android 13; Pixel Mobile Chrome/120", "regular")[0], "Phone")
        self.assertEqual(tags.client_labels(True, "Linux; Android 13; Tab Chrome/120", "regular")[0], "Tablet")

    def test_in_app_webview_before_chrome(self):
        ua = "Linux; Android 13; SM-S911B; wv) AppleWebKit Chrome/120 Mobile Safari"
        self.assertEqual(tags.client_labels(True, ua, "share")[2], "Android WebView (in-app)")

    def test_tv_before_everything(self):
        self.assertEqual(tags.client_labels(True, "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) Chrome", "external")[:2], ("TV", "Tizen (Samsung TV)"))

    def test_missing_user_agent_is_unknown(self):
        self.assertEqual(tags.client_labels(True, None, None), ("Unknown", "Unknown", "Unknown", "Unknown"))

    def test_no_app_record(self):
        self.assertEqual(tags.client_labels(False, None, None), ("No app record",) * 4)


if __name__ == "__main__":
    unittest.main()
