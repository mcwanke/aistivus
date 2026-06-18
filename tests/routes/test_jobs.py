"""
tests/routes/test_jobs.py
Integration tests for job-related routes.

Routes covered:
  GET  /api/v1/jobs
  GET  /api/v1/jobs/{id}
  GET  /api/v1/jobs/{id}/application
  GET  /api/v1/jobs/{id}/activity-log
  POST /api/v1/jobs/create
  POST /api/v1/jobs/{id}/activate
  POST /api/v1/jobs/{id}/generate-orgsummary-prompt
  GET  /api/v1/stats
"""

import database


class TestListJobs:
    def test_returns_empty_list_when_no_jobs(self, client):
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_active_job_after_activate(self, client):
        job_id, _ = database.upsert_job("Acme", "Engineer", "backend")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Acme"
        assert data[0]["title"] == "Engineer"

    def test_inactive_job_not_returned(self, client):
        database.upsert_job("Hidden Corp", "Ghost Role", "general")
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_only_active_jobs_when_mixed(self, client):
        job_id, _ = database.upsert_job("Alpha Corp", "Backend Engineer", "backend")
        database.upsert_job("Beta Inc", "Frontend Engineer", "frontend")  # stays inactive
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Alpha Corp"

    def test_job_includes_application_status(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        job = resp.json()[0]
        assert "application_status" in job

    def test_new_job_has_not_started_application(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert job["application_status"] == "not-started"

    def test_job_includes_agg_scores(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert "agg_score_overall" in job

    def test_job_includes_is_active_field(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert job["is_active"] == 1


class TestGetJob:
    def test_returns_404_for_unknown_id(self, client):
        resp = client.get("/api/v1/jobs/9999")
        assert resp.status_code == 404

    def test_returns_job_data(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "job" in data
        assert "evaluations" in data
        assert "postings" in data

    def test_job_detail_has_correct_company(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.json()["job"]["company_name"] == "Test Corp"

    def test_job_detail_evaluations_empty_on_new_job(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.json()["evaluations"] == []

    def test_job_detail_postings_empty_on_new_job(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.json()["postings"] == []

    def test_job_detail_includes_postings_when_present(self, seeded_client):
        sc = seeded_client
        database.insert_job_posting(
            sc["job_id"],
            source_board="manual",
            source_url="https://example.com",
            description_raw="JD text",
        )
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert len(resp.json()["postings"]) == 1

    def test_get_job_returns_inactive_job(self, client):
        # single-job GET is not filtered by is_active
        job_id, _ = database.upsert_job("Inactive Co", "Analyst", "finance")
        resp = client.get(f"/api/v1/jobs/{job_id}")
        assert resp.status_code == 200
        assert resp.json()["job"]["is_active"] == 0

    def test_eval_row_includes_metadata_fields(self, seeded_client):
        sc = seeded_client
        database.insert_evaluation(sc["job_id"], sc["model_id"])
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        ev = resp.json()["evaluations"][0]
        assert "model_name" in ev
        assert "eval_source" in ev
        assert "prompt_version" in ev
        assert "temperature" in ev


class TestGetJobApplication:
    def test_returns_application_for_new_job(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/application")
        assert resp.status_code == 200
        data = resp.json()
        assert data["exists"] is True
        assert data["application"] is not None

    def test_application_status_is_not_started(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/application")
        assert resp.json()["application"]["application_status"] == "not-started"

    def test_returns_exists_false_for_unknown_job(self, client):
        resp = client.get("/api/v1/jobs/9999/application")
        assert resp.status_code == 200
        assert resp.json()["exists"] is False


class TestActivateJob:
    def test_activate_returns_200_and_updated_job(self, client):
        job_id, _ = database.upsert_job("Zeta Ltd", "Data Eng", "data")
        resp = client.post(f"/api/v1/jobs/{job_id}/activate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_active"] == 1
        assert data["id"] == job_id

    def test_activate_job_appears_in_list(self, client):
        job_id, _ = database.upsert_job("Zeta Ltd", "Data Eng", "data")
        assert client.get("/api/v1/jobs").json() == []
        client.post(f"/api/v1/jobs/{job_id}/activate")
        jobs = client.get("/api/v1/jobs").json()
        assert len(jobs) == 1
        assert jobs[0]["is_active"] == 1

    def test_activate_returns_404_for_unknown_job(self, client):
        resp = client.post("/api/v1/jobs/9999/activate")
        assert resp.status_code == 404

    def test_activate_is_idempotent(self, client):
        job_id, _ = database.upsert_job("Zeta Ltd", "Data Eng", "data")
        client.post(f"/api/v1/jobs/{job_id}/activate")
        resp = client.post(f"/api/v1/jobs/{job_id}/activate")
        assert resp.status_code == 200
        assert resp.json()["is_active"] == 1


class TestStats:
    def test_stats_returns_zeroes_on_empty_db(self, client):
        resp = client.get("/api/v1/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["jobs"] == 0
        assert data["evaluations"] == 0
        assert data["applications"] == 0
        assert data["jobs_applied_to"] == 0
        assert data["applications_in_process"] == 0

    def test_stats_counts_only_active_jobs(self, client):
        job_id, _ = database.upsert_job("A", "B", "general")
        database.upsert_job("C", "D", "general")  # stays inactive
        database.activate_job(job_id)
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs"] == 1

    def test_stats_inactive_jobs_not_counted(self, client):
        database.upsert_job("A", "B", "general")
        database.upsert_job("C", "D", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs"] == 0

    def test_stats_excludes_not_started_from_applications(self, client):
        # upsert_job auto-creates a not-started application
        database.upsert_job("A", "B", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications"] == 0

    def test_stats_counts_active_application(self, client):
        job_id, _ = database.upsert_job("A", "B", "general")
        app_row = database.get_application_for_job(job_id)
        database.update_application_status(app_row["id"], "draft")
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications"] == 1

    def test_stats_jobs_applied_to_counts_applied_flag(self, client):
        job_id, _ = database.upsert_job("A", "B", "general")
        app_row = database.get_application_for_job(job_id)
        database.update_application(app_row["id"], applied=1)
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs_applied_to"] == 1

    def test_stats_jobs_applied_to_excludes_not_applied(self, client):
        database.upsert_job("A", "B", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs_applied_to"] == 0

    def test_stats_applications_in_process_counts_active_statuses(self, client):
        for status in ("applied", "screening", "interview", "offer"):
            job_id, _ = database.upsert_job(f"Co {status}", "Role", "general")
            app_row = database.get_application_for_job(job_id)
            database.update_application_status(app_row["id"], status)
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications_in_process"] == 4

    def test_stats_applications_in_process_excludes_inactive_statuses(self, client):
        for status in ("not-started", "draft", "rejected", "ghosted", "withdrawn"):
            job_id, _ = database.upsert_job(f"Co {status}", "Role", "general")
            app_row = database.get_application_for_job(job_id)
            if status != "not-started":
                database.update_application_status(app_row["id"], status)
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications_in_process"] == 0


class TestJobDetailApplicationId:
    def test_job_detail_includes_application_id(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.status_code == 200
        assert "application_id" in resp.json()["job"]
        assert resp.json()["job"]["application_id"] == sc["app_id"]

    def test_job_detail_application_id_not_none(self, client):
        # upsert_job always auto-creates an application, so application_id is always set
        job_id, _ = database.upsert_job("App Co", "Dev", "backend")
        resp = client.get(f"/api/v1/jobs/{job_id}")
        assert resp.status_code == 200
        assert resp.json()["job"]["application_id"] is not None


class TestActivityLog:
    def test_404_for_unknown_job(self, client):
        resp = client.get("/api/v1/jobs/9999/activity-log")
        assert resp.status_code == 404

    def test_returns_entries_key(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/activity-log")
        assert resp.status_code == 200
        assert "entries" in resp.json()

    def test_new_job_has_audit_entries(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/activity-log")
        entries = resp.json()["entries"]
        # seeded job has description_merged — expects Job Created + Job Description
        audit_entries = [e for e in entries if e["entry_type"] == "audit"]
        assert len(audit_entries) >= 2

    def test_job_created_precedes_job_description_in_log(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/activity-log")
        entries = resp.json()["entries"]
        audit_entries = [e for e in entries if e["entry_type"] == "audit"]
        created_idx = next(
            (i for i, e in enumerate(audit_entries) if "Job created" in (e["text"] or "")), None
        )
        desc_idx = next(
            (i for i, e in enumerate(audit_entries) if "Job description attached" in (e["text"] or "")), None
        )
        assert created_idx is not None, "Expected 'Job created' audit entry"
        assert desc_idx is not None, "Expected 'Job description attached' audit entry"
        assert created_idx < desc_idx

    def test_job_without_description_has_no_description_entry(self, client):
        job_id, _ = database.upsert_job("No Desc Co", "Analyst", "general")
        resp = client.get(f"/api/v1/jobs/{job_id}/activity-log")
        entries = resp.json()["entries"]
        audit_texts = [e["text"] or "" for e in entries if e["entry_type"] == "audit"]
        assert any("Job created" in t for t in audit_texts)
        assert not any("Job description attached" in t for t in audit_texts)

    def test_entry_shape_has_required_fields(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/activity-log")
        entry = resp.json()["entries"][0]
        for field in ("entry_type", "timestamp", "activity_type", "source", "text",
                      "url", "raw_id", "can_delete", "can_edit_timestamp"):
            assert field in entry, f"Missing field: {field}"

    def test_evaluation_entry_includes_eval_data(self, client, model_id):
        job_id, _ = database.upsert_job("Eval Co", "Engineer", "backend",
                                         description_merged="We need engineers.")
        database.insert_evaluation(
            job_id, model_id,
            score_overall=8.5, score_role_fit=7.0, score_scope_fit=8.0,
            score_culture=9.0, score_comp=6.5,
            fit_type="Core Fit", archetype="People Leader",
            recommendation="Apply",
            strengths="Great leadership", gaps="Needs Python",
            keywords="Python, leadership", keyword_gaps="Kubernetes",
            domain_match="Same domain", role_type_match="Target match",
        )
        resp = client.get(f"/api/v1/jobs/{job_id}/activity-log")
        entries = resp.json()["entries"]
        eval_entries = [e for e in entries if e["entry_type"] == "evaluation"]
        assert len(eval_entries) == 1
        ed = eval_entries[0].get("eval_data")
        assert ed is not None, "eval_data missing from evaluation entry"
        for field in ("score_overall", "score_role_fit", "score_scope_fit",
                      "score_culture", "score_comp", "fit_type", "archetype",
                      "recommendation", "strengths", "gaps", "keywords",
                      "keyword_gaps", "domain_match", "role_type_match"):
            assert field in ed, f"eval_data missing field: {field}"
        assert ed["score_overall"] == 8.5
        assert ed["fit_type"] == "Core Fit"
        assert ed["strengths"] == "Great leadership"


class TestCreateJobAuditRecords:
    def test_create_job_writes_job_created_audit(self, client):
        job_id, _ = database.upsert_job("Audit Co", "Dev", "backend")
        app_row = database.get_application_for_job(job_id)
        audit = database.get_application_audit(app_row["id"])
        events = [dict(a)["event"] for a in audit]
        assert any("Job created" in e for e in events)

    def test_create_job_audit_has_job_id_set(self, client):
        job_id, _ = database.upsert_job("Audit Co", "Dev", "backend")
        with database.get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM application_audit WHERE job_id = ?", (job_id,)
            ).fetchall()
        assert len(rows) >= 1
        for row in rows:
            assert dict(row)["job_id"] == job_id

    def test_create_job_with_description_writes_description_audit(self, client):
        job_id, _ = database.upsert_job(
            "Desc Co", "Eng", "backend",
            description_merged="We are looking for an engineer.",
        )
        app_row = database.get_application_for_job(job_id)
        audit = database.get_application_audit(app_row["id"])
        events = [dict(a)["event"] for a in audit]
        assert any("Job description attached" in e for e in events)

    def test_create_job_without_description_skips_description_audit(self, client):
        job_id, _ = database.upsert_job("No Desc Co", "Analyst", "general")
        app_row = database.get_application_for_job(job_id)
        audit = database.get_application_audit(app_row["id"])
        events = [dict(a)["event"] for a in audit]
        assert not any("Job description attached" in e for e in events)


class TestExportJob:
    def test_export_returns_404_for_unknown_job(self, client):
        resp = client.post("/api/v1/jobs/9999/export")
        assert resp.status_code == 404

    def test_export_creates_file_in_done_dir(self, client, tmp_path, monkeypatch):
        import evaluate
        done_dir = tmp_path / "inbox" / "done"
        monkeypatch.setattr(evaluate, "_get_inbox_paths", lambda: (
            tmp_path / "inbox",
            done_dir,
            tmp_path / "inbox" / "failed",
        ))
        job_id, _ = database.upsert_job(
            "Export Corp", "Staff Engineer", "backend",
            description_merged="Great role with great pay.",
            pay_band="$160k-$200k",
        )
        resp = client.post(f"/api/v1/jobs/{job_id}/export")
        assert resp.status_code == 200
        data = resp.json()
        assert "file_name" in data
        assert data["file_name"].startswith(f"{job_id}-export-")
        assert data["file_name"].endswith(".md")
        dest = done_dir / data["file_name"]
        assert dest.exists()

    def test_export_file_contains_job_fields(self, client, tmp_path, monkeypatch):
        import evaluate
        done_dir = tmp_path / "inbox" / "done"
        monkeypatch.setattr(evaluate, "_get_inbox_paths", lambda: (
            tmp_path / "inbox",
            done_dir,
            tmp_path / "inbox" / "failed",
        ))
        job_id, _ = database.upsert_job(
            "Acme Inc", "Senior Manager", "general",
            location="New York",
            remote_type="Hybrid",
            description_merged="Lead the team.",
            pay_band="$150k",
        )
        resp = client.post(f"/api/v1/jobs/{job_id}/export")
        assert resp.status_code == 200
        content = (done_dir / resp.json()["file_name"]).read_text()
        assert "company: Acme Inc" in content
        assert "title: Senior Manager" in content
        assert "location: New York" in content
        assert "remote_type: Hybrid" in content
        assert "pay_band: $150k" in content
        assert "Lead the team." in content

    def test_export_file_omits_pay_band_when_null(self, client, tmp_path, monkeypatch):
        import evaluate
        done_dir = tmp_path / "inbox" / "done"
        monkeypatch.setattr(evaluate, "_get_inbox_paths", lambda: (
            tmp_path / "inbox",
            done_dir,
            tmp_path / "inbox" / "failed",
        ))
        job_id, _ = database.upsert_job(
            "Bare Co", "Analyst", "finance",
            description_merged="Do analysis.",
        )
        resp = client.post(f"/api/v1/jobs/{job_id}/export")
        assert resp.status_code == 200
        content = (done_dir / resp.json()["file_name"]).read_text()
        assert "pay_band: \n" in content or "pay_band:\n" in content or "pay_band: " in content


class TestCompanySummaryRoute:
    def test_put_company_summary_returns_200(self, client):
        job_id, _ = database.upsert_job("Summary Corp", "Engineer", "backend")
        resp = client.put(
            f"/api/v1/jobs/{job_id}/company-summary",
            json={"text": "Great company with strong engineering culture."},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_put_company_summary_persists_to_log(self, client):
        job_id, _ = database.upsert_job("Summary Corp 2", "Designer", "general")
        client.put(
            f"/api/v1/jobs/{job_id}/company-summary",
            json={"text": "Mid-size SaaS company."},
        )
        log = database.get_job_company_log(job_id)
        summary_entries = [e for e in log if dict(e)["type_value"] == "summary"]
        assert len(summary_entries) == 1
        assert dict(summary_entries[0])["log"] == "Mid-size SaaS company."

    def test_put_company_summary_404_for_unknown_job(self, client):
        resp = client.put(
            "/api/v1/jobs/9999/company-summary",
            json={"text": "Some text."},
        )
        assert resp.status_code == 404


class TestGetAllJobsDatabase:
    def test_get_all_jobs_excludes_inactive_by_default(self, client):
        database.upsert_job("Inactive Co", "Analyst", "finance")
        jobs = database.get_all_jobs()
        assert len(jobs) == 0

    def test_get_all_jobs_include_inactive_returns_all(self, client):
        database.upsert_job("Inactive Co", "Analyst", "finance")
        jobs = database.get_all_jobs(include_inactive=True)
        assert len(jobs) == 1

    def test_activate_job_sets_is_active(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        jobs = database.get_all_jobs()
        assert len(jobs) == 1
        assert jobs[0]["is_active"] == 1


# ─────────────────────────────────────────────────────────────
# POST /api/v1/jobs/{id}/generate-orgsummary-prompt
# ─────────────────────────────────────────────────────────────

class TestGenerateOrgSummaryPrompt:
    def test_404_for_unknown_job(self, client):
        resp = client.post("/api/v1/jobs/9999/generate-orgsummary-prompt")
        assert resp.status_code == 404

    def test_404_when_no_application(self, client):
        job_id, _ = database.upsert_job("NoApp Corp", "Engineer", "backend")
        # wipe the auto-created not-started application and its audit rows
        with database.get_connection() as conn:
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.execute("DELETE FROM applications WHERE job_id = ?", (job_id,))
            conn.execute("PRAGMA foreign_keys = ON")
        resp = client.post(f"/api/v1/jobs/{job_id}/generate-orgsummary-prompt")
        assert resp.status_code == 404

    def test_returns_prompt_text(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{seeded_client['job_id']}/generate-orgsummary-prompt"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "prompt" in data
        assert len(data["prompt"]) > 50

    def test_prompt_contains_job_details(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{seeded_client['job_id']}/generate-orgsummary-prompt"
        )
        prompt = resp.json()["prompt"]
        assert "Test Corp" in prompt
        assert "Software Engineer" in prompt

    def test_prompt_logged_with_orgsummary_type(self, seeded_client):
        seeded_client["client"].post(
            f"/api/v1/jobs/{seeded_client['job_id']}/generate-orgsummary-prompt"
        )
        logs = database.get_application_logs(seeded_client["app_id"])
        orgsummary_logs = [log for log in logs if dict(log)["type_value"] == "prompt_orgsummary"]
        assert len(orgsummary_logs) == 1

    def test_prompt_log_id_returned(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{seeded_client['job_id']}/generate-orgsummary-prompt"
        )
        data = resp.json()
        assert "log_id" in data
        assert isinstance(data["log_id"], int)


class TestCreateJobWithoutEval:
    def test_creates_job_active_returns_job_id(self, client):
        resp = client.post(
            "/api/v1/jobs/create",
            json={"company_name": "Acme", "title": "Engineer"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["job_id"], int)
        job = database.get_job(data["job_id"])
        assert job is not None
        assert dict(job)["is_active"] == 1

    def test_application_auto_created(self, client):
        resp = client.post(
            "/api/v1/jobs/create",
            json={"company_name": "Acme", "title": "Engineer"},
        )
        job_id = resp.json()["job_id"]
        app = database.get_application_for_job(job_id)
        assert app is not None

    def test_job_posting_created_when_description_provided(self, client):
        resp = client.post(
            "/api/v1/jobs/create",
            json={"company_name": "Acme", "title": "Engineer", "description": "Great role."},
        )
        job_id = resp.json()["job_id"]
        postings = database.get_postings_for_job(job_id)
        assert len(postings) == 1

    def test_no_posting_when_no_description_or_url(self, client):
        resp = client.post(
            "/api/v1/jobs/create",
            json={"company_name": "Acme", "title": "Engineer"},
        )
        job_id = resp.json()["job_id"]
        postings = database.get_postings_for_job(job_id)
        assert len(postings) == 0

    def test_missing_company_name_returns_422(self, client):
        resp = client.post(
            "/api/v1/jobs/create",
            json={"title": "Engineer"},
        )
        assert resp.status_code == 422

    def test_missing_title_returns_422(self, client):
        resp = client.post(
            "/api/v1/jobs/create",
            json={"company_name": "Acme"},
        )
        assert resp.status_code == 422

    def test_job_visible_in_jobs_list(self, client):
        client.post(
            "/api/v1/jobs/create",
            json={"company_name": "Visible Corp", "title": "Role"},
        )
        jobs = client.get("/api/v1/jobs").json()
        assert any(j["company_name"] == "Visible Corp" for j in jobs)


class TestEvaluateAutoActivate:
    def test_evaluated_job_is_active(self, seeded_client, jobsearch_file, monkeypatch):
        import json
        from unittest.mock import AsyncMock
        import llm_client

        analysis = json.dumps({
            "archetype": "People Leader", "has_deal_breaker": False,
            "deal_breaker_description": None,
            "domain_match": "Same domain", "role_type_match": "Target match",
        })
        good_eval = json.dumps({
            "score_overall": 7.5, "score_role_fit": 4.0, "score_scope_fit": 4.0,
            "score_culture": 3.5, "score_comp": 3.5, "fit_type": "Core Fit",
            "archetype": "People Leader", "strengths": "Good", "gaps": "Some",
            "recommendation": "Apply", "keywords": "python", "domain_match": "Same domain",
            "role_type_match": "Target match", "keyword_gaps": "docker",
        })
        llm_analysis = {
            "success": True, "content": analysis, "error": None,
            "model": "test-model", "provider": "ollama",
            "latency_ms": 80, "prompt_tokens_actual": 30,
            "completion_tokens_actual": 40, "total_tokens_actual": 70,
        }
        llm_scoring = {
            "success": True, "content": good_eval, "error": None,
            "model": "test-model", "provider": "ollama",
            "latency_ms": 100, "prompt_tokens_actual": 50,
            "completion_tokens_actual": 100, "total_tokens_actual": 150,
        }
        monkeypatch.setattr(
            llm_client,
            "complete",
            AsyncMock(side_effect=[llm_analysis, llm_scoring]),
        )
        resp = seeded_client["client"].post(
            "/api/v1/evaluate",
            json={
                "jd_text": "We need an engineer.",
                "company_name": "New Corp",
                "job_title": "Engineer",
                "force": False,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        job = database.get_job(data["job_id"])
        assert dict(job)["is_active"] == 1
