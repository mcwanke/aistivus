"""
tests/routes/test_application_questions.py
Integration tests for application questions routes.

Routes covered:
  GET    /api/v1/applications/{id}/questions
  POST   /api/v1/applications/{id}/questions
  PATCH  /api/v1/applications/{id}/questions/{qid}
  DELETE /api/v1/applications/{id}/questions/{qid}
"""

import database


class TestListQuestions:
    def test_returns_empty_list_when_no_questions(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/applications/{sc['app_id']}/questions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_question_after_create(self, seeded_client):
        sc = seeded_client
        sc["client"].post(
            f"/api/v1/applications/{sc['app_id']}/questions",
            json={"question": "Why do you want this role?", "response": "I love it."},
        )
        resp = sc["client"].get(f"/api/v1/applications/{sc['app_id']}/questions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["question"] == "Why do you want this role?"

    def test_returns_multiple_questions(self, seeded_client):
        sc = seeded_client
        for i in range(3):
            sc["client"].post(
                f"/api/v1/applications/{sc['app_id']}/questions",
                json={"question": f"Question {i}?"},
            )
        resp = sc["client"].get(f"/api/v1/applications/{sc['app_id']}/questions")
        assert len(resp.json()) == 3

    def test_404_for_unknown_application(self, client):
        resp = client.get("/api/v1/applications/9999/questions")
        assert resp.status_code == 404


class TestCreateQuestion:
    def test_creates_question_returns_record(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].post(
            f"/api/v1/applications/{sc['app_id']}/questions",
            json={"question": "Describe your experience.", "response": "5 years."},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["id"] is not None
        assert data["question"] == "Describe your experience."
        assert data["response"] == "5 years."
        assert data["application_id"] == sc["app_id"]

    def test_creates_question_with_null_response(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].post(
            f"/api/v1/applications/{sc['app_id']}/questions",
            json={"question": "What is your salary expectation?"},
        )
        assert resp.status_code == 201
        assert resp.json()["response"] is None

    def test_created_at_is_populated(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].post(
            f"/api/v1/applications/{sc['app_id']}/questions",
            json={"question": "Timestamp test?"},
        )
        assert resp.json()["created_at"] is not None

    def test_404_for_unknown_application(self, client):
        resp = client.post(
            "/api/v1/applications/9999/questions",
            json={"question": "What's your background?"},
        )
        assert resp.status_code == 404

    def test_400_for_empty_question(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].post(
            f"/api/v1/applications/{sc['app_id']}/questions",
            json={"question": "   "},
        )
        assert resp.status_code == 400


class TestUpdateQuestion:
    def _create_question(self, client, app_id, question="Original?", response="Original."):
        resp = client.post(
            f"/api/v1/applications/{app_id}/questions",
            json={"question": question, "response": response},
        )
        return resp.json()["id"]

    def test_updates_question_text(self, seeded_client):
        sc = seeded_client
        q_id = self._create_question(sc["client"], sc["app_id"])
        resp = sc["client"].patch(
            f"/api/v1/applications/{sc['app_id']}/questions/{q_id}",
            json={"question": "Updated question?"},
        )
        assert resp.status_code == 200
        assert resp.json()["question"] == "Updated question?"

    def test_updates_response(self, seeded_client):
        sc = seeded_client
        q_id = self._create_question(sc["client"], sc["app_id"])
        resp = sc["client"].patch(
            f"/api/v1/applications/{sc['app_id']}/questions/{q_id}",
            json={"response": "New answer."},
        )
        assert resp.status_code == 200
        assert resp.json()["response"] == "New answer."

    def test_404_for_unknown_question(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].patch(
            f"/api/v1/applications/{sc['app_id']}/questions/9999",
            json={"question": "Anything?"},
        )
        assert resp.status_code == 404

    def test_404_for_unknown_application(self, client):
        resp = client.patch(
            "/api/v1/applications/9999/questions/1",
            json={"question": "Anything?"},
        )
        assert resp.status_code == 404


class TestDeleteQuestion:
    def _create_question(self, client, app_id):
        resp = client.post(
            f"/api/v1/applications/{app_id}/questions",
            json={"question": "To be deleted?"},
        )
        return resp.json()["id"]

    def test_deletes_existing_question(self, seeded_client):
        sc = seeded_client
        q_id = self._create_question(sc["client"], sc["app_id"])
        del_resp = sc["client"].delete(
            f"/api/v1/applications/{sc['app_id']}/questions/{q_id}"
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True

    def test_question_absent_after_delete(self, seeded_client):
        sc = seeded_client
        q_id = self._create_question(sc["client"], sc["app_id"])
        sc["client"].delete(
            f"/api/v1/applications/{sc['app_id']}/questions/{q_id}"
        )
        resp = sc["client"].get(f"/api/v1/applications/{sc['app_id']}/questions")
        assert resp.json() == []

    def test_404_for_unknown_question(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].delete(
            f"/api/v1/applications/{sc['app_id']}/questions/9999"
        )
        assert resp.status_code == 404

    def test_404_for_unknown_application(self, client):
        resp = client.delete("/api/v1/applications/9999/questions/1")
        assert resp.status_code == 404
