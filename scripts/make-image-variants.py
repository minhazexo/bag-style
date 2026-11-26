#!/usr/bin/env python3
"""Generate and upload responsive WebP variants for every product photo.

For each image in the Supabase `product-images` bucket this writes
`<name>-w160.webp`, `-w480`, `-w960` and `-w1440` next to it. The storefront
builds srcset from that naming convention (src/images.ts).

Images smaller than a target width are re-encoded at their own size under the
larger name, so every srcset candidate exists and nothing is ever upscaled.
Existing variants are skipped, so re-running is cheap.

Credentials: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_ADMIN_EMAIL and
SUPABASE_ADMIN_PASSWORD in the environment (or in a local .env / .env.local file).

    python scripts/make-image-variants.py [--dry-run] [--limit N]
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps

BUCKET = "product-images"
WIDTHS = (160, 480, 960, 1440)
QUALITY = 82
PUBLIC_MARKER = "/storage/v1/object/public/" + BUCKET + "/"
USER_AGENT = "BagStyleImageVariants/1.0"
TIMEOUT = 60


def load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require(name: str, aliases: tuple[str, ...] = ()) -> str:
    for key in (name, *aliases):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    raise SystemExit("Missing environment variable: " + name)


def request(url: str, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None, retries: int = 3):
    req = urllib.request.Request(url, data=body, method=method, headers={"user-agent": USER_AGENT, **(headers or {})})
    for attempt in range(retries):
        try:
            return urllib.request.urlopen(req, timeout=TIMEOUT)
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def variant_path(path: str, width: int) -> str:
    directory, _, name = path.rpartition("/")
    stem = name.rsplit(".", 1)[0]
    return (directory + "/" if directory else "") + stem + "-w" + str(width) + ".webp"


def encode_variant(original: bytes, width: int) -> bytes:
    with Image.open(io.BytesIO(original)) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        source_width, source_height = image.size
        if source_width > width:
            height = max(1, round(source_height * width / source_width))
            image = image.resize((width, height), Image.Resampling.LANCZOS, reducing_gap=3.0)
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=QUALITY, method=6)
        return buffer.getvalue()


class Uploader:
    def __init__(self, base_url: str, api_key: str, email: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.email = email
        self.password = password
        self.token = ""

    def sign_in(self) -> None:
        body = json.dumps({"email": self.email, "password": self.password}).encode()
        with request(
            self.base_url + "/auth/v1/token?grant_type=password",
            method="POST",
            headers={"apikey": self.api_key, "content-type": "application/json"},
            body=body,
        ) as response:
            self.token = json.load(response)["access_token"]
        print("Signed in as " + self.email)

    def auth_headers(self) -> dict[str, str]:
        return {"apikey": self.api_key, "authorization": "Bearer " + self.token}

    def product_images(self) -> list[str]:
        url = self.base_url + "/rest/v1/products?select=slug,images&order=created_at.asc"
        with request(url, headers=self.auth_headers()) as response:
            rows = json.load(response)
        urls: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for image in row.get("images") or []:
                if PUBLIC_MARKER in image and image not in seen:
                    seen.add(image)
                    urls.append(image)
        return urls

    def exists(self, url: str) -> bool:
        try:
            with request(url, method="HEAD") as response:
                return response.status == 200
        except urllib.error.HTTPError as error:
            if error.code in (400, 404):
                return False
            raise

    def upload(self, path: str, payload: bytes) -> int:
        url = self.base_url + "/storage/v1/object/" + BUCKET + "/" + urllib.parse.quote(path)
        headers = {
            **self.auth_headers(),
            "content-type": "image/webp",
            "cache-control": "31536000",
            "x-upsert": "true",
        }
        try:
            with request(url, method="POST", headers=headers, body=payload) as response:
                if response.status >= 300:
                    raise RuntimeError("HTTP " + str(response.status))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:200]
            raise RuntimeError("Upload failed (" + str(error.code) + "): " + detail) from None
        return len(payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report what would happen, upload nothing")
    parser.add_argument("--limit", type=int, default=0, help="only process the first N images")
    args = parser.parse_args()

    load_dotenv(".env")
    load_dotenv(".env.local")
    base_url = require("SUPABASE_URL", ("VITE_SUPABASE_URL",))
    api_key = require("SUPABASE_PUBLISHABLE_KEY", ("VITE_SUPABASE_PUBLISHABLE_KEY",))
    email = require("SUPABASE_ADMIN_EMAIL")
    password = require("SUPABASE_ADMIN_PASSWORD")

    uploader = Uploader(base_url, api_key, email, password)
    uploader.sign_in()

    images = uploader.product_images()
    if args.limit:
        images = images[: args.limit]
    print(str(len(images)) + " product images to check")

    totals = {"uploaded": 0, "skipped": 0, "original_bytes": 0, "variant_bytes": 0}
    failures: list[str] = []
    lock_free_counter = [0]

    def process(url: str) -> None:
        path = urllib.parse.unquote(url.split(PUBLIC_MARKER, 1)[1])
        try:
            with request(url) as response:
                original = response.read()
        except Exception as error:  # noqa: BLE001 - report and keep going
            failures.append(path + ": download failed " + str(error))
            return

        written = 0
        for width in WIDTHS:
            target = variant_path(path, width)
            public_url = base_url + PUBLIC_MARKER + urllib.parse.quote(target)
            try:
                if uploader.exists(public_url):
                    totals["skipped"] += 1
                    continue
                if args.dry_run:
                    written += 1
                    continue
                payload = encode_variant(original, width)
                uploader.upload(target, payload)
                totals["uploaded"] += 1
                written += len(payload)
            except Exception as error:  # noqa: BLE001
                failures.append(target + ": " + str(error))

        totals["original_bytes"] += len(original)
        totals["variant_bytes"] += written or len(original)
        lock_free_counter[0] += 1
        if lock_free_counter[0] % 20 == 0 or lock_free_counter[0] == len(images):
            print("  " + str(lock_free_counter[0]) + "/" + str(len(images)) + " images")

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(process, images))

    saved = totals["original_bytes"] - totals["variant_bytes"]
    print(
        "\nUploaded " + str(totals["uploaded"]) + " variants, skipped " + str(totals["skipped"]) + " existing"
    )
    print(
        "Originals "
        + str(round(totals["original_bytes"] / 1024 / 1024, 1))
        + " MB -> one variant set "
        + str(round(totals["variant_bytes"] / 1024 / 1024, 1))
        + " MB ("
        + str(round(saved / max(totals["original_bytes"], 1) * 100))
        + "% smaller per image)"
    )
    if failures:
        print("Failures (" + str(len(failures)) + "):")
        for failure in failures[:20]:
            print("  " + failure)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
