"""
Synapse Live Debug — Project Auto-Detection
=============================================
Detects the language, framework, package manager, and structure
of the project being debugged, by scanning marker files.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("synapse-debug.detector")

# ─── Marker Files → Language ──────────────────────────────────────────────────
LANGUAGE_MARKERS: list[tuple[str, str]] = [
    ("Cargo.toml",          "rust"),
    ("go.mod",              "go"),
    ("pyproject.toml",      "python"),
    ("setup.py",            "python"),
    ("setup.cfg",           "python"),
    ("requirements.txt",    "python"),
    ("Pipfile",             "python"),
    ("package.json",        "javascript"),
    ("tsconfig.json",       "typescript"),
    ("deno.json",           "typescript"),
    ("pom.xml",             "java"),
    ("build.gradle",        "java"),
    ("build.gradle.kts",    "kotlin"),
    ("*.csproj",            "csharp"),
    ("*.fsproj",            "fsharp"),
    ("mix.exs",             "elixir"),
    ("Gemfile",             "ruby"),
    ("composer.json",       "php"),
    ("pubspec.yaml",        "dart"),
    ("Package.swift",       "swift"),
    ("CMakeLists.txt",      "cpp"),
    ("Makefile",            "c"),
]

# ─── Marker Files → Framework ────────────────────────────────────────────────
FRAMEWORK_MARKERS: list[tuple[str, str, str]] = [
    # (marker_file, content_check, framework_name)
    ("manage.py",             "",                       "django"),
    ("app.py",                "Flask",                  "flask"),
    ("main.py",               "FastAPI",                "fastapi"),
    ("main.py",               "Starlette",              "starlette"),
    ("next.config.js",        "",                       "nextjs"),
    ("next.config.mjs",       "",                       "nextjs"),
    ("next.config.ts",        "",                       "nextjs"),
    ("nuxt.config.ts",        "",                       "nuxt"),
    ("svelte.config.js",      "",                       "sveltekit"),
    ("angular.json",          "",                       "angular"),
    ("vue.config.js",         "",                       "vue"),
    ("vite.config.ts",        "",                       "vite"),
    ("vite.config.js",        "",                       "vite"),
    ("astro.config.mjs",      "",                       "astro"),
    ("remix.config.js",       "",                       "remix"),
    ("tauri.conf.json",       "",                       "tauri"),
    ("electron-builder.yml",  "",                       "electron"),
    ("Cargo.toml",            "actix",                  "actix-web"),
    ("Cargo.toml",            "axum",                   "axum"),
    ("Cargo.toml",            "rocket",                 "rocket"),
    ("go.mod",                "gin-gonic",              "gin"),
    ("go.mod",                "echo",                   "echo"),
    ("go.mod",                "fiber",                  "fiber"),
    ("pom.xml",               "spring-boot",            "spring-boot"),
    ("build.gradle",          "spring-boot",            "spring-boot"),
    ("Gemfile",               "rails",                  "rails"),
    ("Gemfile",               "sinatra",                "sinatra"),
    ("composer.json",         "laravel",                "laravel"),
    ("composer.json",         "symfony",                "symfony"),
    ("pubspec.yaml",          "flutter",                "flutter"),
]

# ─── Package Manager Detection ────────────────────────────────────────────────
PKG_MANAGER_MARKERS: list[tuple[str, str]] = [
    ("pnpm-lock.yaml",     "pnpm"),
    ("yarn.lock",          "yarn"),
    ("bun.lockb",          "bun"),
    ("package-lock.json",  "npm"),
    ("Pipfile.lock",       "pipenv"),
    ("poetry.lock",        "poetry"),
    ("uv.lock",            "uv"),
    ("pdm.lock",           "pdm"),
    ("Cargo.lock",         "cargo"),
    ("go.sum",             "go-modules"),
    ("Gemfile.lock",       "bundler"),
    ("composer.lock",      "composer"),
    ("pubspec.lock",       "pub"),
]


def detect_languages(root: Path) -> list[str]:
    """Detect all programming languages used in the project."""
    found: set[str] = set()
    for marker, lang in LANGUAGE_MARKERS:
        if "*" in marker:
            # Glob pattern
            if list(root.glob(marker)):
                found.add(lang)
        elif (root / marker).exists():
            found.add(lang)
    return sorted(found)


def detect_frameworks(root: Path) -> list[str]:
    """Detect frameworks used in the project."""
    found: set[str] = set()
    for marker_file, content_check, framework in FRAMEWORK_MARKERS:
        target = root / marker_file
        if not target.exists():
            continue
        if not content_check:
            found.add(framework)
        else:
            try:
                content = target.read_text(encoding="utf-8", errors="ignore")
                if content_check.lower() in content.lower():
                    found.add(framework)
            except Exception:
                pass
    return sorted(found)


def detect_package_managers(root: Path) -> list[str]:
    """Detect package managers used in the project."""
    found: list[str] = []
    for marker, pm in PKG_MANAGER_MARKERS:
        if (root / marker).exists():
            found.append(pm)
    return found


def detect_entry_points(root: Path) -> list[str]:
    """Find likely entry-point files."""
    candidates = [
        "main.py", "app.py", "manage.py", "server.py", "run.py",
        "index.js", "index.ts", "server.js", "server.ts", "app.js", "app.ts",
        "main.go", "main.rs", "Main.java", "Program.cs",
        "index.html",
    ]
    found = []
    # Check root
    for c in candidates:
        if (root / c).exists():
            found.append(c)
    # Check src/
    src = root / "src"
    if src.exists():
        for c in candidates:
            if (src / c).exists():
                found.append(f"src/{c}")
    return found


def detect_config_files(root: Path) -> list[str]:
    """Find configuration files in the project root."""
    configs = []
    config_patterns = [
        ".env", ".env.local", ".env.example",
        "docker-compose.yml", "docker-compose.yaml", "Dockerfile",
        ".eslintrc*", ".prettierrc*", "tsconfig.json", "jsconfig.json",
        "pyproject.toml", "setup.cfg", "tox.ini", "pytest.ini",
        ".github/workflows/*.yml", ".gitlab-ci.yml",
        "Makefile", "justfile", "Taskfile.yml",
    ]
    for pattern in config_patterns:
        if "*" in pattern:
            for p in root.glob(pattern):
                configs.append(str(p.relative_to(root)))
        elif (root / pattern).exists():
            configs.append(pattern)
    return sorted(configs)


def detect_project(root: Path) -> dict[str, Any]:
    """
    Full project detection. Returns a comprehensive project profile.
    """
    root = root.resolve()
    name = root.name

    languages = detect_languages(root)
    frameworks = detect_frameworks(root)
    pkg_managers = detect_package_managers(root)
    entry_points = detect_entry_points(root)
    config_files = detect_config_files(root)

    # Primary language = first detected
    primary_lang = languages[0] if languages else "unknown"

    # Read project name from package.json / pyproject.toml / Cargo.toml if available
    project_name = name
    if (root / "package.json").exists():
        try:
            pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
            project_name = pkg.get("name", name)
        except Exception:
            pass
    elif (root / "pyproject.toml").exists():
        try:
            content = (root / "pyproject.toml").read_text(encoding="utf-8")
            for line in content.splitlines():
                if line.strip().startswith("name"):
                    project_name = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        except Exception:
            pass

    # Detect test directories
    test_dirs = []
    for td in ["tests", "test", "__tests__", "spec", "specs", "test_suite"]:
        if (root / td).exists() and (root / td).is_dir():
            test_dirs.append(td)

    # Detect docs directories
    doc_dirs = []
    for dd in ["docs", "doc", "documentation", "wiki"]:
        if (root / dd).exists() and (root / dd).is_dir():
            doc_dirs.append(dd)

    result = {
        "name": project_name,
        "root": str(root),
        "primaryLanguage": primary_lang,
        "languages": languages,
        "frameworks": frameworks,
        "packageManagers": pkg_managers,
        "entryPoints": entry_points,
        "configFiles": config_files,
        "testDirs": test_dirs,
        "docDirs": doc_dirs,
    }

    logger.info(f"Detected project: {project_name} [{primary_lang}] frameworks={frameworks}")
    return result
