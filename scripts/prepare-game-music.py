"""Create small, browser-ready copies; keep the supplied originals in sounds/.

Usage: python scripts/prepare-game-music.py --ffmpeg /path/to/ffmpeg
"""

import argparse
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
TRACKS = {
    "peaceful ville.ogg": "peaceful-village.mp3",
    "sunset_plains.wav": "sunset-plains.mp3",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    args = parser.parse_args()
    if not args.ffmpeg:
        parser.error("Install FFmpeg or supply --ffmpeg with its executable path.")
    destination = ROOT / "public" / "game-assets" / "music"
    destination.mkdir(parents=True, exist_ok=True)
    for original, filename in TRACKS.items():
        source = ROOT / "sounds" / original
        output = destination / filename
        subprocess.run([
            args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-map", "0:a:0", "-map_metadata", "-1", "-vn", "-c:a", "libmp3lame",
            "-b:a", "160k", "-ar", "44100", str(output),
        ], check=True)
        print(f"{filename}: {source.stat().st_size:,} -> {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
