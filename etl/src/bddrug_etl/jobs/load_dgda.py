"""CLI: load one batch of DGDA concepts from the national OCL server."""
import argparse, logging, os, pathlib

import httpx, psycopg

from bddrug_etl.load.batches import read_batch_file, run_batch
from bddrug_etl.ocl.client import OclClient

log = logging.getLogger("load_dgda")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Load a batch of DGDA registered products from OCL")
    parser.add_argument("--batch", type=pathlib.Path, required=True, help="batches/NNNN-name.txt")
    args = parser.parse_args()
    ids = read_batch_file(args.batch)
    base = os.environ.get("OCL_BASE_URL", "https://api.tr.ocl.dghs.gov.bd")
    with httpx.Client(headers={"User-Agent": "bddrug-etl/0.1 (+niramoy)"}) as http, \
            psycopg.connect(os.environ.get("DATABASE_URL", "")) as conn:
        stats = run_batch(conn, OclClient(base, http), args.batch.stem, ids)
    log.info("batch=%s requested=%d loaded=%d missing=%d", args.batch.stem, len(ids), stats.loaded, len(ids) - stats.seen)


if __name__ == "__main__":
    main()
