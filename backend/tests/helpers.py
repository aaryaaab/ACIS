"""Small helpers shared by API tests."""
from tests.test_api import ADULT, TECH_ASSESSMENT, onboard_and_assess, signup  # noqa: F401


def ready_student(client, name="Student"):
    """Registers, onboards and assesses a technology-leaning adult student. Returns auth headers."""
    headers, _ = signup(client, name)
    onboard_and_assess(client, headers)
    return headers


def explore_student(client, name="Young"):
    """A Class 9 student (minor, with guardian consent). ACIS must not push a career on them."""
    from tests.test_api import ADULT, TECH_ASSESSMENT, onboard_and_assess, signup
    headers, _ = signup(client, name)
    onboard_and_assess(client, headers, onboarding={**ADULT, "date_of_birth": "2012-01-01",
                                                    "education_level": "class_9", "guardian_consent": True})
    return headers


def my_id(client, headers):
    return client.get("/auth/me", headers=headers).json()["id"]
