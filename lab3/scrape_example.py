import requests
from bs4 import BeautifulSoup
import pandas as pd

print("Libraries loaded successfully")


# task2
url = "https://baidu.com"
response = requests.get(url, timeout=10)

print(response)
print(response.status_code)

response = requests.get(url, timeout=10)

response.raise_for_status()

print("Request successful")

print(response.text[:1000])  # Print the first 1000 characters of the response text

# user agent  我是谁
headers = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}

response = requests.get(
    url,
    headers=headers,
    timeout=10
)

# task4
html = """
<html>
<body>
    <h1>Book Store</h1>
    <p class="description">Welcome to our store.</p>
</body>
</html>
"""

soup = BeautifulSoup(html, "html.parser")

heading = soup.find("h1")
print("========Task4========")
print(heading.get_text(strip=True))

description = soup.find(
    "p",
    class_="description"
)

print(description.get_text(strip=True))

books = soup.find_all(
    "div",
    class_="book"
)

for book in books:
    print(book.get_text(strip=True))


print("========Task6========")

import requests
from bs4 import BeautifulSoup

url = "https://books.toscrape.com/"

headers = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}

response = requests.get(
    url,
    headers=headers,
    timeout=10
)

response.raise_for_status()

soup = BeautifulSoup(
    response.text,
    "html.parser"
)

books = soup.select("article.product_pod")

print("Books on page:", len(books))

book = books[0]

title = book.select_one("h3 a")["title"]

print(title)

price = book.select_one(
    ".price_color"
).get_text(strip=True)

print(price)
# 提取所有记录
records = []

for book in books:

    title = book.select_one("h3 a")["title"]

    price_text = book.select_one(
        ".price_color"
    ).get_text(strip=True)



    price = float(
        price_text.replace("£", "").replace("Â", "")
    )

    records.append({
        "title": title,
        "price": price
    })

print(records[:3])

print("========Task7========")
df = pd.DataFrame(records)

print(df.head())
df.to_csv(
    "../data/books.csv",
    index=False
)
df.to_json(
    "../data/books.json",
    orient="records",
    indent=2
)

print("========Task8========")
for page in range(1, 6):

    url = (
        "https://books.toscrape.com/"
        f"catalogue/page-{page}.html"
    )

    print(url)


records = []

for page in range(1, 6):

    url = (
        "https://books.toscrape.com/"
        f"catalogue/page-{page}.html"
    )

    response = requests.get(
        url,
        timeout=10
    )

    response.raise_for_status()

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    books = soup.select(
        "article.product_pod"
    )

    for book in books:

        title = book.select_one(
            "h3 a"
        )["title"]

        price = book.select_one(
            ".price_color"
        ).get_text(strip=True)

        records.append({
            "title": title,
            "price": price,
            "page": page
        })

print("Total records:", len(records))