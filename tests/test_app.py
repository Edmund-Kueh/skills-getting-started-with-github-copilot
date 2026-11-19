import unittest
from copy import deepcopy
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.app import activities, app


class UnregisterTests(unittest.TestCase):
    def setUp(self):
        self.activities_patch = patch("src.app.activities", deepcopy(activities))
        self.activities = self.activities_patch.start()
        self.addCleanup(self.activities_patch.stop)
        self.client = TestClient(app)

    def test_unregister_removes_only_selected_participant_and_allows_signup_again(self):
        name = "Chess Club"
        email = self.activities[name]["participants"][0]
        remaining = self.activities[name]["participants"][1:]
        other_activity = deepcopy(self.activities["Programming Class"])

        response = self.client.delete(
            f"/activities/{name}/unregister", params={"email": email}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": f"Unregistered {email} from {name}"})
        self.assertEqual(self.client.get("/activities").json()[name]["participants"], remaining)
        self.assertEqual(self.activities["Programming Class"], other_activity)
        self.assertEqual(
            self.client.post(f"/activities/{name}/signup", params={"email": email}).status_code,
            200,
        )

    def test_unregister_unknown_activity(self):
        response = self.client.delete(
            "/activities/Unknown/unregister", params={"email": "student@example.com"}
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Activity not found"})

    def test_unregister_absent_participant_leaves_activity_unchanged(self):
        before = deepcopy(self.activities)
        response = self.client.delete(
            "/activities/Chess Club/unregister", params={"email": "absent@example.com"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "Student is not signed up for this activity"})
        self.assertEqual(self.activities, before)
