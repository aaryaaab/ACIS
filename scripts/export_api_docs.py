"""Writes docs/API.md from the running app's OpenAPI schema, so the documentation matches the code."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://acis:acis@localhost:5432/acis")

from app.main import app  # noqa: E402


def body_fields(schema, components):
    ref = schema.get("$ref", "")
    if ref:
        schema = components[ref.rsplit("/", 1)[-1]]
    props, required = schema.get("properties", {}), set(schema.get("required", []))
    return ", ".join(f"{k}{'*' if k in required else ''}" for k in props)


def main():
    spec = app.openapi()
    comps = spec.get("components", {}).get("schemas", {})
    groups: dict[str, list] = {}
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            tag = (op.get("tags") or ["other"])[0]
            query = ", ".join(p["name"] for p in op.get("parameters", []) if p["in"] == "query")
            body = ""
            content = op.get("requestBody", {}).get("content", {})
            for ctype, c in content.items():
                body = body_fields(c.get("schema", {}), comps)
                if "multipart" in ctype:
                    body = "multipart: " + body
            auth = "yes" if op.get("security") else "no"
            groups.setdefault(tag, []).append((method.upper(), path, op.get("summary", ""), auth, query, body))
    total = sum(len(v) for v in groups.values())
    lines = ["# ACIS API reference", "",
             f"Generated from the code by `python scripts/export_api_docs.py` ({total} endpoints). "
             "Interactive version: run the backend and open `/docs` (Swagger) or `/redoc`.", "",
             "`*` marks a required field. Login = the httpOnly session cookie set by `/auth/login` (the website also sends the `X-CSRF-Token` header on POST/PUT/PATCH/DELETE), or `Authorization: Bearer <token>` with the token from `/auth/login` for API clients and Swagger. "
             "A record that belongs to someone else always returns 404.", ""]
    for tag in sorted(groups):
        lines += [f"## {tag}", "", "| Method | Path | What it does | Login | Query parameters | Body |", "|---|---|---|---|---|---|"]
        for method, path, summary, auth, query, body in sorted(groups[tag], key=lambda r: (r[1], r[0])):
            lines.append(f"| {method} | `{path}` | {summary} | {auth} | {query} | {body} |")
        lines.append("")
    out = ROOT / "docs" / "API.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} with {total} endpoints in {len(groups)} groups")


if __name__ == "__main__":
    main()
