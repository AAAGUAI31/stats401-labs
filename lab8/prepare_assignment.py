"""Build the Lab 8 assignment dataset from the official DKU bulletin.

The script deliberately uses a reproducible, local semantic pipeline:

PDF blocks -> structured passages -> TF-IDF -> 16-dimensional LSA
-> two-dimensional PCA projection -> cosine K-means topics.

Only PyMuPDF is required for PDF extraction.  The numerical routines use
Python's standard library so the assignment can be rebuilt without downloading
a large neural model at page-load time.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT / "data" / "archive" / "V2021-22_DKU_UG_Bulletin.pdf"
DEFAULT_OUTPUT = Path(__file__).with_name("assignment-data.json")

SOURCE_URL = (
    "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/"
    "dkumain/files/V2021-22_DKU_UG_Bulletin.pdf"
)
TOPIC_COUNT = 8

# Common function words plus corpus boilerplate that otherwise dominates every
# topic.  Domain terms such as credit, registration, major, and research remain.
STOPWORDS = set(
    """
    a about above after again against all am an and any are as at be because
    been before being below between both but by can could did do does doing
    down during each few for from further had has have having he her here hers
    herself him himself his how i if in into is it its itself just me more most
    my myself no nor not now of off on once only or other our ours ourselves
    out over own same she should so some such than that the their theirs them
    themselves then there these they this those through to too under until up
    very was we were what when where which while who whom why will with would
    you your yours yourself yourselves may must also one two three four per
    university duke kunshan dku student students course courses program programs
    academic undergraduate school education including include includes offered
    requirements requirement credit credits faculty study studies year years
    information office new use used using based provide provides
    """.split()
)

TOKEN_RE = re.compile(r"[a-z][a-z'-]{2,}")
COURSE_TITLE_RE = re.compile(
    r"^(?:[A-Z]{2,10}\s*){1,3}\d{2,4}[A-Z]?(?:\s*[/–-]\s*[A-Z]{2,10}\s*\d{2,4})?.*\(\d+(?:\.\d+)?\s+credits?\)",
    re.I,
)
PART_RE = re.compile(r"^Part\s+\d+\s*:", re.I)


def clean_text(text: str) -> str:
    """Repair recurring PDF glyph artifacts and normalize whitespace."""
    replacements = {
        "\ufffd\ufffd": "'",
        "\ufffdC": "-",
        "\uf0b7": "•",
        "\uf0a7": "•",
        "\u00a0": " ",
        "–": "-",
        "—": "-",
        "“": '"',
        "”": '"',
        "’": "'",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text, flags=re.UNICODE))


def block_record(block: dict) -> dict | None:
    if "lines" not in block:
        return None
    spans = [span for line in block["lines"] for span in line["spans"]]
    text = clean_text(" ".join(span["text"] for span in spans))
    if not text:
        return None
    sizes = [float(span["size"]) for span in spans if span["text"].strip()]
    flags = [int(span["flags"]) for span in spans if span["text"].strip()]
    return {
        "text": text,
        "max_size": max(sizes, default=0),
        "bold_share": sum(bool(flag & 16) for flag in flags) / max(1, len(flags)),
    }


def looks_like_table_row(text: str) -> bool:
    if "Course Code Course Name Course Credit" in text:
        return True
    if re.match(r"^(?:Choose|And choose|And complete|Course Code)\b", text, re.I):
        return True
    if re.match(r"^[A-Z]{2,10}\s*\d{2,4}", text) and word_count(text) < 18 and not COURSE_TITLE_RE.match(text):
        return True
    # Grade conversion tables look like prose after PDF extraction but contain
    # no interpretable sentence and otherwise become a one-record topic.
    if len(re.findall(r"\b[A-F][+-]?\s+\d", text)) >= 4:
        return True
    return False


def split_long_passage(text: str, maximum: int = 175) -> list[str]:
    if word_count(text) <= maximum:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'])", text)
    chunks: list[str] = []
    current: list[str] = []
    current_words = 0
    for sentence in sentences:
        length = word_count(sentence)
        if current and current_words + length > maximum:
            chunks.append(" ".join(current))
            current, current_words = [], 0
        current.append(sentence)
        current_words += length
    if current:
        chunks.append(" ".join(current))
    return chunks


def extract_passages(pdf_path: Path) -> tuple[list[dict], int, int]:
    """Extract passages while carrying the latest detected document headings."""
    document = fitz.open(pdf_path)
    chapter = "Part 1: General Information"
    section = "General Information"
    subsection = "Overview"
    course_subject = "Course Descriptions"
    raw_blocks: list[dict] = []

    # PDF pages 3-9 are the table of contents.  Page 10 starts the bulletin body.
    for page_index in range(9, document.page_count):
        pdf_page = page_index + 1
        page = document[page_index]
        blocks = [block_record(block) for block in page.get_text("dict")["blocks"]]
        blocks = [block for block in blocks if block]
        first_body_on_page = True

        for block in blocks:
            text = block["text"]
            size = block["max_size"]
            bold = block["bold_share"] >= 0.5
            words = word_count(text)

            if text.isdigit() or text in {"Table of Contents", "Course Code Course Name Course Credit"}:
                continue

            if PART_RE.match(text) and size >= 15:
                chapter = text
                section = text.split(":", 1)[-1].strip()
                subsection = "Overview"
                continue

            # Part 10 contains major tables followed by nearly 180 pages of
            # course descriptions.  Grouping these under stable formal sections
            # keeps the matrix readable while retaining the specific title in
            # subsection.
            if 83 <= page_index < 216:
                section = "Major Requirements"
                if bold and words <= 18 and size >= 11.5:
                    subsection = text
                    continue

            if 216 <= page_index < 396:
                section = "Course Descriptions"
                if text.startswith("Courses with Course Subject:"):
                    course_subject = text.replace("Courses with Course Subject:", "").strip()
                    subsection = course_subject
                    continue
                if text == "Course Descriptions":
                    subsection = "Course Descriptions"
                    continue
                if COURSE_TITLE_RE.match(text) and words <= 30:
                    subsection = text
                    continue

            if size >= 13.5 and bold and words <= 20:
                section = text
                subsection = "Overview"
                continue

            # Short bold blocks at about 12pt are subsection headings.  A length
            # guard avoids mistaking mixed-format body paragraphs for headings.
            if size >= 11.5 and bold and words <= 16 and not re.search(r"[.!?]$", text):
                subsection = text
                continue

            if looks_like_table_row(text) or words < 8:
                continue

            record = {
                "chapter": chapter,
                "section": section,
                "subsection": subsection,
                "page": pdf_page,
                "text": text,
            }

            # Join a page-opening continuation to the previous passage when the
            # metadata matches and either side clearly lacks a paragraph break.
            if raw_blocks and first_body_on_page:
                previous = raw_blocks[-1]
                same_context = (
                    previous["chapter"] == chapter
                    and previous["section"] == section
                    and previous["subsection"] == subsection
                    and previous["page"] == pdf_page - 1
                )
                continuation = text[:1].islower() or not re.search(r"[.!?\"]$", previous["text"])
                if same_context and continuation and word_count(previous["text"]) < 220:
                    previous["text"] = clean_text(previous["text"] + " " + text)
                    first_body_on_page = False
                    continue

            raw_blocks.append(record)
            first_body_on_page = False

    raw_count = len(raw_blocks)
    cleaned: list[dict] = []
    seen: set[str] = set()

    for record in raw_blocks:
        for chunk in split_long_passage(record["text"]):
            chunk = clean_text(chunk)
            count = word_count(chunk)
            if count < 24:
                # Attach a short continuation to the preceding passage when it
                # shares the same formal location.
                if cleaned and all(cleaned[-1][key] == record[key] for key in ("chapter", "section", "subsection")):
                    cleaned[-1]["text"] = clean_text(cleaned[-1]["text"] + " " + chunk)
                    cleaned[-1]["text_clean"] = cleaned[-1]["text"]
                    cleaned[-1]["word_count"] = word_count(cleaned[-1]["text"])
                continue

            fingerprint = re.sub(r"\W+", "", chunk.lower())
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            item = dict(record)
            item["text"] = chunk
            item["text_clean"] = chunk
            item["word_count"] = count
            cleaned.append(item)

    for index, record in enumerate(cleaned, start=1):
        record["passage_id"] = f"p{index:04d}"

    return cleaned, raw_count, document.page_count


def tokenize(text: str) -> list[str]:
    tokens = []
    for token in TOKEN_RE.findall(text.lower()):
        token = token.strip("'-")
        if token and token not in STOPWORDS:
            tokens.append(token)
    return tokens


def build_tfidf(passages: list[dict], max_features: int = 4200) -> tuple[list[dict[int, float]], list[str], Counter]:
    tokenized = [tokenize(item["text_clean"]) for item in passages]
    document_frequency: Counter = Counter()
    total_frequency: Counter = Counter()
    for tokens in tokenized:
        total_frequency.update(tokens)
        document_frequency.update(set(tokens))

    n_documents = len(passages)
    allowed = [
        term for term, frequency in total_frequency.most_common()
        if document_frequency[term] >= 3 and document_frequency[term] <= n_documents * 0.72
    ][:max_features]
    vocabulary = {term: index for index, term in enumerate(allowed)}
    vectors: list[dict[int, float]] = []

    for tokens in tokenized:
        counts = Counter(token for token in tokens if token in vocabulary)
        vector: dict[int, float] = {}
        for term, frequency in counts.items():
            tf = 1.0 + math.log(frequency)
            idf = math.log((1 + n_documents) / (1 + document_frequency[term])) + 1.0
            vector[vocabulary[term]] = tf * idf
        norm = math.sqrt(sum(value * value for value in vector.values())) or 1.0
        vectors.append({index: value / norm for index, value in vector.items()})

    return vectors, allowed, total_frequency


def dot_sparse(vector: dict[int, float], dense: list[float]) -> float:
    return sum(value * dense[index] for index, value in vector.items())


def normalize(vector: list[float]) -> list[float]:
    length = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / length for value in vector]


def orthogonalize(vector: list[float], basis: list[list[float]]) -> list[float]:
    result = vector[:]
    for base in basis:
        projection = sum(a * b for a, b in zip(result, base))
        for index in range(len(result)):
            result[index] -= projection * base[index]
    return result


def lsa_embeddings(
    tfidf: list[dict[int, float]], vocabulary_size: int, dimensions: int = 16, iterations: int = 22
) -> list[list[float]]:
    """Approximate truncated SVD with power iteration on X.T @ X."""
    rng = random.Random(401)
    components: list[list[float]] = []
    document_components: list[list[float]] = [[] for _ in tfidf]

    for _ in range(dimensions):
        vector = normalize([rng.uniform(-1, 1) for _ in range(vocabulary_size)])
        vector = normalize(orthogonalize(vector, components))

        for _ in range(iterations):
            document_scores = [dot_sparse(row, vector) for row in tfidf]
            updated = [0.0] * vocabulary_size
            for row, score in zip(tfidf, document_scores):
                for index, value in row.items():
                    updated[index] += value * score
            updated = orthogonalize(updated, components)
            vector = normalize(updated)

        components.append(vector)
        scores = [dot_sparse(row, vector) for row in tfidf]
        for item, score in zip(document_components, scores):
            item.append(score)

    return [normalize(row) for row in document_components]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def pca_projection(embeddings: list[list[float]], iterations: int = 60) -> list[tuple[float, float]]:
    dimensions = len(embeddings[0])
    means = [sum(row[j] for row in embeddings) / len(embeddings) for j in range(dimensions)]
    centered = [[value - means[j] for j, value in enumerate(row)] for row in embeddings]
    covariance = [[0.0] * dimensions for _ in range(dimensions)]
    for row in centered:
        for i in range(dimensions):
            for j in range(dimensions):
                covariance[i][j] += row[i] * row[j]

    rng = random.Random(802)
    basis: list[list[float]] = []
    for _ in range(2):
        vector = normalize([rng.uniform(-1, 1) for _ in range(dimensions)])
        for _ in range(iterations):
            updated = [sum(covariance[i][j] * vector[j] for j in range(dimensions)) for i in range(dimensions)]
            vector = normalize(orthogonalize(updated, basis))
        basis.append(vector)

    coordinates = [
        (sum(value * basis[0][j] for j, value in enumerate(row)),
         sum(value * basis[1][j] for j, value in enumerate(row)))
        for row in centered
    ]
    return coordinates


def kmeans(embeddings: list[list[float]], k: int = 10, iterations: int = 60) -> tuple[list[int], list[list[float]]]:
    # Deterministic farthest-point initialization spreads seeds across the corpus.
    first = max(range(len(embeddings)), key=lambda i: sum(abs(value) for value in embeddings[i]))
    centroids = [embeddings[first][:]]
    while len(centroids) < k:
        next_index = max(
            range(len(embeddings)),
            key=lambda i: min(1 - cosine(embeddings[i], centroid) for centroid in centroids),
        )
        centroids.append(embeddings[next_index][:])

    labels = [-1] * len(embeddings)
    for _ in range(iterations):
        new_labels = [
            max(range(k), key=lambda cluster: cosine(row, centroids[cluster]))
            for row in embeddings
        ]
        # Spherical K-means can occasionally leave a centroid empty after an
        # update.  Move the least well-represented document from a non-singleton
        # cluster into each empty cluster so all requested topics remain valid.
        counts = Counter(new_labels)
        for empty_cluster in (cluster for cluster in range(k) if counts[cluster] == 0):
            candidate = min(
                (i for i, label in enumerate(new_labels) if counts[label] > 1),
                key=lambda i: cosine(embeddings[i], centroids[new_labels[i]]),
            )
            counts[new_labels[candidate]] -= 1
            new_labels[candidate] = empty_cluster
            counts[empty_cluster] = 1
        if new_labels == labels:
            break
        labels = new_labels
        updated: list[list[float]] = []
        for cluster in range(k):
            members = [embeddings[i] for i, label in enumerate(labels) if label == cluster]
            if not members:
                updated.append(centroids[cluster])
                continue
            mean = [sum(row[j] for row in members) / len(members) for j in range(len(embeddings[0]))]
            updated.append(normalize(mean))
        centroids = updated
    return labels, centroids


def topic_terms(labels: list[int], tfidf: list[dict[int, float]], terms: list[str], k: int) -> list[list[str]]:
    results: list[list[str]] = []
    for cluster in range(k):
        totals: defaultdict[int, float] = defaultdict(float)
        members = [i for i, label in enumerate(labels) if label == cluster]
        for index in members:
            for term_index, value in tfidf[index].items():
                totals[term_index] += value
        ranked = sorted(totals, key=lambda index: totals[index] / max(1, len(members)), reverse=True)
        results.append([terms[index] for index in ranked[:10]])
    return results


def entropy(values: list[int]) -> float:
    total = sum(values)
    if not total:
        return 0.0
    return -sum((value / total) * math.log2(value / total) for value in values if value)


def build_dataset(pdf_path: Path) -> dict:
    passages, raw_count, page_count = extract_passages(pdf_path)
    tfidf, terms, total_frequency = build_tfidf(passages)
    embeddings = lsa_embeddings(tfidf, len(terms), dimensions=16)
    coordinates = pca_projection(embeddings)
    labels, centroids = kmeans(embeddings, k=TOPIC_COUNT)
    top_terms = topic_terms(labels, tfidf, terms, k=TOPIC_COUNT)

    # Labels were assigned after inspecting each cluster's characteristic terms
    # and three centroid-nearest passages.  The numeric result is deterministic
    # for this bulletin and the fixed seeds above.
    topic_names = {
        0: "Student Services and Administration",
        1: "STEM, Data and Systems",
        2: "Enrollment and Term Progress",
        3: "Global Society, History and Politics",
        4: "Majors and Interdisciplinary Research",
        5: "Credits, Grades and Degree Progress",
        6: "Leave, Withdrawal and Health",
        7: "Language, Writing and Communication",
    }

    section_members: defaultdict[str, list[int]] = defaultdict(list)
    for index, passage in enumerate(passages):
        section_members[passage["section"]].append(index)

    section_centroids: dict[str, list[float]] = {}
    for section, members in section_members.items():
        mean = [sum(embeddings[i][j] for i in members) / len(members) for j in range(len(embeddings[0]))]
        section_centroids[section] = normalize(mean)

    for index, passage in enumerate(passages):
        passage["cluster"] = labels[index]
        passage["cluster_name"] = topic_names[labels[index]]
        passage["x"] = round(coordinates[index][0], 6)
        passage["y"] = round(coordinates[index][1], 6)
        passage["embedding"] = [round(value, 6) for value in embeddings[index]]
        passage["section_similarity"] = round(cosine(embeddings[index], section_centroids[passage["section"]]), 6)

        neighbors = sorted(
            (
                (other, cosine(embeddings[index], embeddings[other]))
                for other in range(len(passages)) if other != index
            ),
            key=lambda item: item[1],
            reverse=True,
        )[:5]
        passage["neighbors"] = [
            {"passage_id": passages[other]["passage_id"], "similarity": round(score, 6)}
            for other, score in neighbors
        ]

    topic_summary = []
    for cluster in range(TOPIC_COUNT):
        members = [i for i, label in enumerate(labels) if label == cluster]
        representatives = sorted(members, key=lambda i: cosine(embeddings[i], centroids[cluster]), reverse=True)[:3]
        topic_summary.append({
            "cluster": cluster,
            "cluster_name": topic_names[cluster],
            "count": len(members),
            "top_terms": top_terms[cluster],
            "representative_passages": [passages[i]["passage_id"] for i in representatives],
        })

    section_summary = []
    for section, members in section_members.items():
        counts = Counter(labels[index] for index in members)
        section_summary.append({
            "section": section,
            "count": len(members),
            "average_words": round(sum(passages[i]["word_count"] for i in members) / len(members), 2),
            "topic_count": len(counts),
            "topic_entropy": round(entropy(list(counts.values())), 4),
        })
    section_summary.sort(key=lambda item: item["count"], reverse=True)

    meaningful_terms = [
        {"term": term, "count": count}
        for term, count in total_frequency.most_common(24)
        if term in set(terms)
    ][:15]

    keyword_summary = []
    for keyword in ("credit", "graduation", "registration", "academic integrity"):
        matching = [
            passage for passage in passages
            if keyword in passage["text_clean"].lower()
        ]
        topic_counts = Counter(item["cluster_name"] for item in matching)
        section_counts = Counter(item["section"] for item in matching)
        keyword_summary.append({
            "keyword": keyword,
            "count": len(matching),
            "topics": [{"name": name, "count": count} for name, count in topic_counts.most_common()],
            "sections": [{"name": name, "count": count} for name, count in section_counts.most_common(6)],
        })

    return {
        "metadata": {
            "title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
            "academic_year": "2021-2022",
            "source": "Official Duke Kunshan University admissions file",
            "source_url": SOURCE_URL,
            "date_accessed": date.today().isoformat(),
            "pdf_pages": page_count,
            "raw_passages": raw_count,
            "clean_passages": len(passages),
            "average_passage_words": round(sum(item["word_count"] for item in passages) / len(passages), 2),
            "formal_sections": len(section_members),
            "embedding_model": "TF-IDF latent semantic analysis (16-dimensional truncated SVD)",
            "projection": "PCA to two dimensions on normalized LSA embeddings",
            "clustering": f"Cosine K-means, k={TOPIC_COUNT}, deterministic farthest-point initialization",
        },
        "top_terms": meaningful_terms,
        "topic_summary": topic_summary,
        "section_summary": section_summary,
        "keyword_summary": keyword_summary,
        "passages": passages,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.pdf.exists():
        raise FileNotFoundError(
            f"Bulletin not found at {args.pdf}. Download it from {SOURCE_URL}."
        )

    dataset = build_dataset(args.pdf)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "output": str(args.output),
        "metadata": dataset["metadata"],
        "topics": dataset["topic_summary"],
        "largest_sections": dataset["section_summary"][:12],
        "keywords": dataset["keyword_summary"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
