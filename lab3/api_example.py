import requests

url = "https://jsonplaceholder.typicode.com/posts"

response = requests.get(url, timeout=10)
response.raise_for_status()

data = response.json()

print(type(data))
print(len(data))
print(data[0])

first_post = data[0]

print(first_post["id"])
print(first_post["title"])

records = []

for post in data:

    records.append({
        "id": post["id"],
        "user_id": post["userId"],
        "title": post["title"]
    })


import pandas as pd

df = pd.DataFrame(records)

df.to_csv(
    "../data/posts.csv",
    index=False
)

print("========Task13========")

params = {
    "userId": 1
}

response = requests.get(
    "https://jsonplaceholder.typicode.com/posts",
    params=params,
    timeout=10
)

response.raise_for_status()

data = response.json()

import requests
import time

all_records = []

for page in range(1, 11):

    params = {
        "page": page,
        "limit": 100
    }

    response = requests.get(
        "https://api.example.com/items",
        params=params,
        timeout=10
    )

    response.raise_for_status()

    page_data = response.json()

    all_records.extend(page_data)

    if len(all_records) >= 1000:
        break

    time.sleep(1)

all_records = all_records[:1000]