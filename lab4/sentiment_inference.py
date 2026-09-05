"""Run Twitter-RoBERTa inference without requiring pandas in this environment."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
LABELS = ("Negative", "Neutral", "Positive")
FIELDNAMES = (
    "sentiment_negative",
    "sentiment_neutral",
    "sentiment_positive",
    "sentiment_score",
    "sentiment",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=16)
    return parser.parse_args()


def model_labels(model: AutoModelForSequenceClassification) -> dict[int, str]:
    configured = {
        int(index): str(label).capitalize()
        for index, label in model.config.id2label.items()
    }
    if set(configured.values()) == set(LABELS):
        return configured
    if len(configured) == 3:
        return {0: "Negative", 1: "Neutral", 2: "Positive"}
    raise ValueError(f"Unexpected model labels: {model.config.id2label}")


def read_texts(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return [row["sentiment_text"] for row in csv.DictReader(handle)]


def main() -> None:
    args = parse_args()
    if args.batch_size < 1:
        raise ValueError("batch-size must be at least 1")

    texts = read_texts(args.input)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    labels = model_labels(model)

    print(f"Running {MODEL_NAME} on {device}...")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()

        with torch.inference_mode():
            for start in range(0, len(texts), args.batch_size):
                batch = tokenizer(
                    texts[start : start + args.batch_size],
                    return_tensors="pt",
                    padding=True,
                    truncation=True,
                    max_length=512,
                )
                batch = {name: tensor.to(device) for name, tensor in batch.items()}
                probabilities = torch.softmax(model(**batch).logits, dim=-1).cpu().tolist()

                for scores in probabilities:
                    by_label = {
                        labels[index]: float(score) for index, score in enumerate(scores)
                    }
                    winner = max(by_label, key=by_label.get)
                    writer.writerow(
                        {
                            "sentiment_negative": by_label["Negative"],
                            "sentiment_neutral": by_label["Neutral"],
                            "sentiment_positive": by_label["Positive"],
                            "sentiment_score": by_label["Positive"] - by_label["Negative"],
                            "sentiment": winner,
                        }
                    )

                completed = min(start + args.batch_size, len(texts))
                if completed == len(texts) or completed % (args.batch_size * 10) == 0:
                    print(f"  Processed {completed:,}/{len(texts):,} tweets")


if __name__ == "__main__":
    main()

