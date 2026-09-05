"""Download and reproducibly sample the Customer Support on Twitter dataset."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


DATASET_HANDLE = "thoughtvector/customer-support-on-twitter"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "lab4_raw_tweets.csv"
ROWS_PER_GROUP = 2_500
SEED = 401


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        help="Optional path to an existing twcs.csv; otherwise download it with kagglehub.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def locate_source(source: Path | None) -> Path:
    if source is not None:
        source = source.expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Source CSV not found: {source}")
        return source

    import kagglehub

    dataset_dir = Path(kagglehub.dataset_download(DATASET_HANDLE))
    matches = list(dataset_dir.rglob("twcs.csv"))
    if not matches:
        raise FileNotFoundError(f"twcs.csv was not found under {dataset_dir}")
    return matches[0]


def deterministic_stratified_sample(source: Path) -> pd.DataFrame:
    """Keep the 2,500 lowest stable hash priorities from each inbound group."""
    best: dict[str, pd.DataFrame | None] = {"true": None, "false": None}

    for chunk in pd.read_csv(source, chunksize=100_000, low_memory=False):
        required = {"tweet_id", "author_id", "inbound", "created_at", "text"}
        missing = required.difference(chunk.columns)
        if missing:
            raise ValueError(f"Source dataset is missing columns: {sorted(missing)}")

        inbound_key = chunk["inbound"].astype("string").str.strip().str.lower()
        chunk = chunk.assign(
            _inbound_key=inbound_key,
            _priority=pd.util.hash_pandas_object(
                chunk["tweet_id"].astype("string") + f"|{SEED}", index=False
            ).astype("uint64"),
        )

        for group in best:
            candidates = chunk.loc[chunk["_inbound_key"] == group]
            if candidates.empty:
                continue
            combined = pd.concat([best[group], candidates], ignore_index=True)
            best[group] = combined.nsmallest(ROWS_PER_GROUP, "_priority")

    if any(frame is None or len(frame) < ROWS_PER_GROUP for frame in best.values()):
        counts = {key: 0 if frame is None else len(frame) for key, frame in best.items()}
        raise ValueError(f"Not enough rows to create the requested stratified sample: {counts}")

    sample = pd.concat([best["true"], best["false"]], ignore_index=True)
    sample = sample.sample(frac=1, random_state=SEED).drop(
        columns=["_inbound_key", "_priority"]
    )
    return sample.reset_index(drop=True)


def main() -> None:
    args = parse_args()
    source = locate_source(args.source)
    sample = deterministic_stratified_sample(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sample.to_csv(args.output, index=False)

    counts = sample["inbound"].astype("string").str.lower().value_counts()
    print(f"Source: {source}")
    print(f"Saved {len(sample):,} uncleaned records to {args.output}")
    print("Inbound distribution:")
    print(counts.to_string())


if __name__ == "__main__":
    main()

