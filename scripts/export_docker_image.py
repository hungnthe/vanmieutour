"""Build and export the Linux/amd64 image plus a transfer bundle."""

import json
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "artifacts" / "docker"
IMAGE = "heritage-map:1.1.0"
IMAGE_TAR = OUTPUT_DIR / "heritage-map_1.1.0_linux_amd64.tar"
TRANSFER_BUNDLE = OUTPUT_DIR / "heritage-map-docker.zip"


def run(*args: str, capture_output: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=capture_output,
    )
    return result.stdout.strip() if capture_output else ""


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    run(
        "docker",
        "buildx",
        "build",
        "--platform",
        "linux/amd64",
        "--tag",
        IMAGE,
        "--load",
        str(ROOT),
    )

    metadata = json.loads(
        run("docker", "image", "inspect", IMAGE, capture_output=True)
    )[0]
    if metadata["Os"] != "linux" or metadata["Architecture"] != "amd64":
        raise RuntimeError(
            f"Expected linux/amd64 image; got {metadata['Os']}/{metadata['Architecture']}"
        )

    run("docker", "save", "--output", str(IMAGE_TAR), IMAGE)
    run("docker", "load", "--input", str(IMAGE_TAR))

    with ZipFile(TRANSFER_BUNDLE, "w", ZIP_DEFLATED, compresslevel=6) as bundle:
        bundle.write(IMAGE_TAR, IMAGE_TAR.name)
        bundle.write(ROOT / "compose.yaml", "compose.yaml")
        bundle.write(ROOT / "DOCKER_DEPLOY.md", "DOCKER_DEPLOY.md")

    with ZipFile(TRANSFER_BUNDLE) as bundle:
        names = set(bundle.namelist())
    expected = {IMAGE_TAR.name, "compose.yaml", "DOCKER_DEPLOY.md"}
    if names != expected:
        raise RuntimeError(f"Unexpected transfer bundle contents: {sorted(names)}")

    print(f"Image: {IMAGE} (linux/amd64, {metadata['Size']:,} bytes)")
    print(f"Docker save archive: {IMAGE_TAR.relative_to(ROOT)} ({IMAGE_TAR.stat().st_size:,} bytes)")
    print(
        f"Transfer bundle: {TRANSFER_BUNDLE.relative_to(ROOT)} "
        f"({TRANSFER_BUNDLE.stat().st_size:,} bytes)"
    )


if __name__ == "__main__":
    main()
