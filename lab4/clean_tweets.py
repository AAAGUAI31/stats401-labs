"""Clean the Lab 4 tweet sample and estimate sentiment with Twitter-RoBERTa."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "lab4_raw_tweets.csv"
DEFAULT_CLEAN = ROOT / "data" / "lab4_clean_tweets.csv"
DEFAULT_AGGREGATE = ROOT / "data" / "lab4_sentiment_by_author.csv"
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
LABELS = ("Negative", "Neutral", "Positive")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--clean-output", type=Path, default=DEFAULT_CLEAN)
    parser.add_argument("--aggregate-output", type=Path, default=DEFAULT_AGGREGATE)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument(
        "--sentiment-python",
        type=Path,
        default=Path(sys.executable),
        help="Python executable that has torch and transformers installed.",
    )
    return parser.parse_args()


def normalize_inbound(series: pd.Series) -> pd.Series:
    values = series.astype("string").str.strip().str.lower()
    return values.map({"true": True, "1": True, "false": False, "0": False})


def prepare_for_roberta(text: str) -> str:
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def audit_raw_data(df: pd.DataFrame) -> None:
    print("Raw data shape:", df.shape)
    print("\nMissing values:")
    print(df.isna().sum().to_string())
    print("\nColumn types:")
    print(df.dtypes.to_string())
    print("\nExact duplicate rows:", int(df.duplicated().sum()))
    print("Duplicate tweet IDs:", int(df.duplicated("tweet_id").sum()))


def clean_structured_fields(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    required = {"tweet_id", "author_id", "inbound", "created_at", "text"}
    missing = required.difference(raw.columns)
    if missing:
        raise ValueError(f"Input is missing columns: {sorted(missing)}")

    stats: dict[str, int] = {"raw_rows": len(raw)}
    df = raw.copy()

    before = len(df)
    df = df.drop_duplicates()
    stats["exact_duplicates_removed"] = before - len(df)

    before = len(df)
    df = df.drop_duplicates(subset=["tweet_id"], keep="first")
    stats["duplicate_ids_removed"] = before - len(df)

    df["tweet_text_raw"] = (
        df["text"].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
    )
    before = len(df)
    df = df.loc[df["tweet_text_raw"].notna() & df["tweet_text_raw"].ne("")].copy()
    stats["missing_or_empty_text_removed"] = before - len(df)

    df["created_at"] = pd.to_datetime(
        df["created_at"],
        format="%a %b %d %H:%M:%S %z %Y",
        errors="coerce",
        utc=True,
    )
    before = len(df)
    df = df.dropna(subset=["created_at"]).copy()
    stats["invalid_dates_removed"] = before - len(df)

    df["inbound_clean"] = normalize_inbound(df["inbound"])
    before = len(df)
    df = df.dropna(subset=["inbound_clean"]).copy()
    stats["invalid_inbound_removed"] = before - len(df)

    df["tweet_id"] = df["tweet_id"].astype("string")
    df["author_id"] = df["author_id"].astype("string").str.strip()
    df["author_type"] = df["inbound_clean"].map({True: "Customer", False: "Support"})
    df["date"] = df["created_at"].dt.strftime("%Y-%m-%d")
    df["hour"] = df["created_at"].dt.hour.astype("int64")
    df["weekday"] = df["created_at"].dt.day_name()
    df["sentiment_text"] = df["tweet_text_raw"].apply(prepare_for_roberta)
    stats["clean_rows"] = len(df)
    return df, stats


def predict_sentiment(
    texts: list[str], batch_size: int, sentiment_python: Path
) -> pd.DataFrame:
    if batch_size < 1:
        raise ValueError("batch-size must be at least 1")
    helper = Path(__file__).with_name("sentiment_inference.py")
    with tempfile.TemporaryDirectory(prefix="lab4_sentiment_", dir=ROOT) as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "sentiment_input.csv"
        output_path = temp_path / "sentiment_output.csv"
        pd.DataFrame({"sentiment_text": texts}).to_csv(input_path, index=False)
        command = [
            str(sentiment_python), str(helper), "--input", str(input_path),
            "--output", str(output_path), "--batch-size", str(batch_size),
        ]
        subprocess.run(command, check=True)
        predictions = pd.read_csv(output_path)

    if len(predictions) != len(texts):
        raise ValueError(
            f"Sentiment output row count {len(predictions)} does not match {len(texts)}"
        )
    return predictions


def build_aggregate(df: pd.DataFrame) -> pd.DataFrame:
    aggregate = (
        df.groupby(["author_type", "sentiment"], observed=True)
        .agg(count=("tweet_id", "size"), average_score=("sentiment_score", "mean"))
        .reset_index()
    )
    totals = aggregate.groupby("author_type")["count"].transform("sum")
    aggregate["share"] = aggregate["count"] / totals
    author_order = {"Customer": 0, "Support": 1}
    sentiment_order = {label: index for index, label in enumerate(LABELS)}
    aggregate["_author_order"] = aggregate["author_type"].map(author_order)
    aggregate["_sentiment_order"] = aggregate["sentiment"].map(sentiment_order)
    return aggregate.sort_values(["_author_order", "_sentiment_order"]).drop(
        columns=["_author_order", "_sentiment_order"]
    )


def main() -> None:
    args = parse_args()
    raw = pd.read_csv(args.input, dtype={"tweet_id": "string", "author_id": "string"})
    audit_raw_data(raw)
    df, stats = clean_structured_fields(raw)
    prediction_df = predict_sentiment(
        df["sentiment_text"].tolist(), args.batch_size, args.sentiment_python
    )
    prediction_df.index = df.index
    df = pd.concat([df, prediction_df], axis=1)

    output_columns = [
        "tweet_id", "created_at", "date", "hour", "weekday", "author_id",
        "author_type", "tweet_text_raw", "sentiment_text", "sentiment_negative",
        "sentiment_neutral", "sentiment_positive", "sentiment_score", "sentiment",
    ]
    clean_df = df[output_columns].copy()
    aggregate = build_aggregate(clean_df)

    args.clean_output.parent.mkdir(parents=True, exist_ok=True)
    args.aggregate_output.parent.mkdir(parents=True, exist_ok=True)
    clean_df.to_csv(args.clean_output, index=False, float_format="%.8f")
    aggregate.to_csv(args.aggregate_output, index=False, float_format="%.8f")

    print("\nCleaning summary:")
    for key, value in stats.items():
        print(f"  {key}: {value:,}")
    print("\nPredicted sentiment counts:")
    print(clean_df["sentiment"].value_counts().to_string())
    print(f"\nSaved clean records to {args.clean_output}")
    print(f"Saved visualization aggregate to {args.aggregate_output}")


if __name__ == "__main__":
    main()
