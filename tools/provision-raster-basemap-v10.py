#!/usr/bin/env python3
"""Validate and atomically import an already licensed raster MBTiles basemap.

This does not download OSM public tiles, convert OSM PBF to raster, or attest
that an operator's stated copyright/attribution metadata is legally correct.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sqlite3
from contextlib import closing
import tempfile
from urllib.parse import urlparse

VALID_LICENSES = {'ODbL-1.0', 'CC-BY-4.0', 'CC0-1.0', 'Proprietary-Licensed', 'Other-Verified'}
MAX_BYTES = 12 * 1024**3  # explicit upper bound; operators should provision storage first


def ensure_url(value: str, field: str):
    p = urlparse(value)
    if p.scheme != 'https' or not p.netloc or p.username or p.password:
        raise ValueError(f'{field} must be an HTTPS provenance URL without credentials')


def sha256_file(filename: Path):
    hasher = sha256()
    with filename.open('rb') as f:
        while chunk := f.read(4 * 1024 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_raster_mbtiles(file: Path):
    if file.is_symlink() or not file.is_file() or file.suffix.lower() != '.mbtiles':
        raise ValueError('A regular .mbtiles file is required (symlinks refused)')
    if file.stat().st_size < 100 or file.stat().st_size > MAX_BYTES:
        raise ValueError('Unexpected MBTiles size')
    from services.tiles.tile_service import TileStore
    # Metadata and tile signatures must match the existing v0.9 readonly service.
    store = TileStore(str(file), 'License validation placeholder')
    with closing(sqlite3.connect('file:' + __import__('urllib.parse', fromlist=['quote']).quote(str(file.resolve())) + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
        count = db.execute('SELECT COUNT(*) FROM tiles').fetchone()[0]
        if count <= 0:
            raise ValueError('No tiles in MBTiles archive')
        samples = db.execute('SELECT zoom_level,tile_column,tile_row FROM tiles LIMIT 15').fetchall()
        for z, x, tms_y in samples:
            if store.tile(z, x, 2**z - 1 - tms_y) is None:
                raise ValueError('Missing or invalid sample tile')
    return store, count


def provision(source: Path, destination: Path, *, source_url: str, license_id: str,
              license_url: str, attribution: str, dataset_kind: str, replace: bool = False):
    if license_id not in VALID_LICENSES:
        raise ValueError('Choose a supported license identifier and manually verify that it applies')
    if dataset_kind not in ('REAL_GEOGRAPHY', 'SYNTHETIC_TEST_ONLY'):
        raise ValueError('Explicitly classify the dataset as real geographic data or synthetic test data')
    ensure_url(source_url, 'Source URL')
    ensure_url(license_url, 'License URL')
    if not attribution.strip() or len(attribution) > 500:
        raise ValueError('A concise nonempty attribution is required')
    if license_id == 'ODbL-1.0' and 'OpenStreetMap' not in attribution:
        raise ValueError('OpenStreetMap attribution is required for OSM-derived data')
    src = source.absolute()
    dst = destination.absolute()
    if src == dst or destination.suffix.lower() != '.mbtiles':
        raise ValueError('Destination must be a separate .mbtiles archive')
    if destination.exists() and not replace:
        raise FileExistsError('Existing map archive: use --replace deliberately')
    store, count = validate_raster_mbtiles(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_symlink() or destination.parent.is_symlink():
        raise ValueError('Symlink destinations are not allowed')
    manifest_path = destination.with_suffix('.manifest.json')
    if manifest_path.exists() and not replace:
        raise FileExistsError('Existing map manifest: use --replace deliberately')
    fd, temporary = tempfile.mkstemp(prefix='.assettrust-tiles-', suffix='.mbtiles', dir=destination.parent)
    try:
        os.close(fd)
        shutil.copyfile(source, temporary)
        new_hash = sha256_file(Path(temporary))
        if new_hash != sha256_file(source):
            raise ValueError('Source/destination cryptographic fingerprints disagree')
        # Validate the copied archive before making it visible to the tile server.
        validate_raster_mbtiles(Path(temporary))
        manifest = dict(
            classification=dataset_kind, source_url=source_url, license_id=license_id,
            license_url=license_url, attribution=attribution,
            sha256=new_hash, tiles=count, format=store.format, bounds=store.bounds,
            minzoom=store.minzoom, maxzoom=store.maxzoom,
            imported_utc=datetime.now(timezone.utc).isoformat(),
            warning='Operator-provided license metadata; independently verify redistribution rights. This is NOT cadastral evidence.',
        )
        temp_manifest = Path(temporary + '.manifest.json')
        temp_manifest.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        os.chmod(temporary, 0o644)
        os.replace(temporary, destination)
        os.replace(temp_manifest, manifest_path)
        return manifest
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
        temp_manifest = Path(temporary + '.manifest.json')
        if temp_manifest.exists():
            temp_manifest.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', default='data/maps/uganda.mbtiles', type=Path)
    parser.add_argument('--source-url', required=True)
    parser.add_argument('--license-id', required=True, choices=sorted(VALID_LICENSES))
    parser.add_argument('--license-url', required=True)
    parser.add_argument('--attribution', required=True)
    parser.add_argument('--kind', required=True, choices=['REAL_GEOGRAPHY', 'SYNTHETIC_TEST_ONLY'])
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args()
    manifest = provision(args.input, args.output, source_url=args.source_url,
        license_id=args.license_id, license_url=args.license_url, attribution=args.attribution,
        dataset_kind=args.kind, replace=args.replace)
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    main()
