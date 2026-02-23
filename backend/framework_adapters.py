"""
Synapse Live Debug — Framework Adapters
=========================================
Each adapter knows how to extract routes, models, middleware, etc.
from a specific web framework's source code or config files.

Usage:
    adapter = get_adapter("fastapi", project_root)
    info = adapter.extract()  # → dict with routes, models, etc.
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

logger = logging.getLogger("synapse-debug.adapters")


class FrameworkAdapter(ABC):
    """Base class for framework-specific introspection."""

    name: str = "generic"

    def __init__(self, root: Path):
        self.root = root

    @abstractmethod
    def extract(self) -> dict[str, Any]:
        """Extract framework-specific information."""
        ...

    def _read_text(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""


class FastAPIAdapter(FrameworkAdapter):
    name = "fastapi"

    def extract(self) -> dict[str, Any]:
        routes = []
        models = []
        middleware = []

        for py_file in self.root.rglob("*.py"):
            content = self._read_text(py_file)
            rel = str(py_file.relative_to(self.root))

            # Find route decorators: @app.get("/path"), @router.post("/path"), etc.
            for m in re.finditer(
                r'@\w+\.(get|post|put|delete|patch|options|head|websocket)\s*\(\s*["\']([^"\']+)',
                content,
            ):
                method = m.group(1).upper()
                path = m.group(2)
                routes.append({"method": method, "path": path, "file": rel})

            # Find Pydantic models: class Foo(BaseModel):
            for m in re.finditer(r'class\s+(\w+)\s*\(\s*BaseModel\s*\)', content):
                models.append({"name": m.group(1), "file": rel})

            # Find middleware
            for m in re.finditer(r'add_middleware\s*\(\s*(\w+)', content):
                middleware.append(m.group(1))

        return {
            "framework": "fastapi",
            "routes": routes,
            "models": models,
            "middleware": sorted(set(middleware)),
        }


class ExpressAdapter(FrameworkAdapter):
    name = "express"

    def extract(self) -> dict[str, Any]:
        routes = []
        middleware = []

        for js_file in list(self.root.rglob("*.js")) + list(self.root.rglob("*.ts")):
            rel_parts = js_file.relative_to(self.root).parts
            if "node_modules" in rel_parts or "dist" in rel_parts:
                continue
            content = self._read_text(js_file)
            rel = str(js_file.relative_to(self.root))

            # app.get('/path', ...) or router.post('/path', ...)
            for m in re.finditer(
                r'(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*["\']([^"\']+)',
                content,
            ):
                routes.append({"method": m.group(1).upper(), "path": m.group(2), "file": rel})

            # app.use(...)
            for m in re.finditer(r'app\.use\s*\(\s*(\w+)', content):
                middleware.append(m.group(1))

        return {
            "framework": "express",
            "routes": routes,
            "models": [],
            "middleware": sorted(set(middleware)),
        }


class DjangoAdapter(FrameworkAdapter):
    name = "django"

    def extract(self) -> dict[str, Any]:
        routes = []
        models = []
        apps = []

        # Find urls.py files
        for urls_file in self.root.rglob("urls.py"):
            content = self._read_text(urls_file)
            rel = str(urls_file.relative_to(self.root))

            for m in re.finditer(r'path\s*\(\s*["\']([^"\']*)["\']', content):
                routes.append({"path": m.group(1), "file": rel})

        # Find models.py files
        for models_file in self.root.rglob("models.py"):
            content = self._read_text(models_file)
            rel = str(models_file.relative_to(self.root))

            for m in re.finditer(r'class\s+(\w+)\s*\(\s*(?:models\.Model|AbstractUser)', content):
                models.append({"name": m.group(1), "file": rel})

        # Find installed apps in settings
        for settings_file in self.root.rglob("settings.py"):
            content = self._read_text(settings_file)
            for m in re.finditer(r"'(\w[\w.]*)'", content):
                name = m.group(1)
                if "." in name and not name.startswith("django."):
                    apps.append(name)

        return {
            "framework": "django",
            "routes": routes,
            "models": models,
            "apps": apps,
            "middleware": [],
        }


class NextJSAdapter(FrameworkAdapter):
    name = "nextjs"

    def extract(self) -> dict[str, Any]:
        routes = []
        api_routes = []

        # App router (app/ directory)
        app_dir = self.root / "app"
        if app_dir.exists():
            for page in app_dir.rglob("page.*"):
                route_path = "/" + str(page.parent.relative_to(app_dir)).replace("\\", "/")
                if route_path == "/.":
                    route_path = "/"
                routes.append({"path": route_path, "file": str(page.relative_to(self.root))})

            for route_file in app_dir.rglob("route.*"):
                route_path = "/api/" + str(route_file.parent.relative_to(app_dir)).replace("\\", "/")
                api_routes.append({"path": route_path, "file": str(route_file.relative_to(self.root))})

        # Pages router (pages/ directory)
        pages_dir = self.root / "pages"
        if pages_dir.exists():
            for page in pages_dir.rglob("*.tsx"):
                if page.name.startswith("_"):
                    continue
                route_path = "/" + str(page.relative_to(pages_dir)).replace("\\", "/").replace(".tsx", "")
                if route_path.endswith("/index"):
                    route_path = route_path[:-6] or "/"
                routes.append({"path": route_path, "file": str(page.relative_to(self.root))})

        return {
            "framework": "nextjs",
            "routes": routes,
            "apiRoutes": api_routes,
            "models": [],
            "middleware": [],
        }


class SpringBootAdapter(FrameworkAdapter):
    name = "spring-boot"

    def extract(self) -> dict[str, Any]:
        routes = []
        models = []

        for java_file in list(self.root.rglob("*.java")) + list(self.root.rglob("*.kt")):
            content = self._read_text(java_file)
            rel = str(java_file.relative_to(self.root))

            # @GetMapping, @PostMapping, @RequestMapping
            for m in re.finditer(
                r'@(Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["\']([^"\']+)',
                content,
            ):
                method = m.group(1).upper()
                if method == "REQUEST":
                    method = "*"
                routes.append({"method": method, "path": m.group(2), "file": rel})

            # @Entity classes
            if "@Entity" in content:
                for m in re.finditer(r'class\s+(\w+)', content):
                    models.append({"name": m.group(1), "file": rel})
                    break

        return {
            "framework": "spring-boot",
            "routes": routes,
            "models": models,
            "middleware": [],
        }


class RailsAdapter(FrameworkAdapter):
    name = "rails"

    def extract(self) -> dict[str, Any]:
        routes = []
        models = []

        # config/routes.rb
        routes_rb = self.root / "config" / "routes.rb"
        if routes_rb.exists():
            content = self._read_text(routes_rb)
            for m in re.finditer(r'(get|post|put|patch|delete|resources?|root)\s+[:\'"]([\w/]+)', content):
                routes.append({"method": m.group(1), "path": m.group(2)})

        # app/models/*.rb
        models_dir = self.root / "app" / "models"
        if models_dir.exists():
            for rb in models_dir.glob("*.rb"):
                name = rb.stem.replace("_", " ").title().replace(" ", "")
                models.append({"name": name, "file": str(rb.relative_to(self.root))})

        return {
            "framework": "rails",
            "routes": routes,
            "models": models,
            "middleware": [],
        }


class GenericAdapter(FrameworkAdapter):
    name = "generic"

    def extract(self) -> dict[str, Any]:
        return {
            "framework": "generic",
            "routes": [],
            "models": [],
            "middleware": [],
        }


# ─── Registry ────────────────────────────────────────────────────────────────
_ADAPTERS: dict[str, type[FrameworkAdapter]] = {
    "fastapi": FastAPIAdapter,
    "starlette": FastAPIAdapter,
    "flask": FastAPIAdapter,  # Similar decorator pattern
    "express": ExpressAdapter,
    "django": DjangoAdapter,
    "nextjs": NextJSAdapter,
    "nuxt": NextJSAdapter,  # Similar structure
    "spring-boot": SpringBootAdapter,
    "rails": RailsAdapter,
    "sinatra": RailsAdapter,
}


def get_adapter(framework: str, root: Path) -> FrameworkAdapter:
    """Get the appropriate adapter for a framework."""
    cls = _ADAPTERS.get(framework, GenericAdapter)
    return cls(root)


def get_all_adapters(frameworks: list[str], root: Path) -> list[FrameworkAdapter]:
    """Get adapters for all detected frameworks."""
    seen = set()
    adapters = []
    for fw in frameworks:
        cls = _ADAPTERS.get(fw, GenericAdapter)
        if cls not in seen:
            seen.add(cls)
            adapters.append(cls(root))
    if not adapters:
        adapters.append(GenericAdapter(root))
    return adapters


def extract_all(frameworks: list[str], root: Path) -> dict[str, Any]:
    """Run all relevant adapters and merge results."""
    merged: dict[str, Any] = {
        "frameworks": [],
        "routes": [],
        "models": [],
        "middleware": [],
    }
    for adapter in get_all_adapters(frameworks, root):
        result = adapter.extract()
        fw = result.get("framework", adapter.name)
        if fw not in merged["frameworks"]:
            merged["frameworks"].append(fw)
        merged["routes"].extend(result.get("routes", []))
        merged["models"].extend(result.get("models", []))
        for mw in result.get("middleware", []):
            if mw not in merged["middleware"]:
                merged["middleware"].append(mw)
    return merged
