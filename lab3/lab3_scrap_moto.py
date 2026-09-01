import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from urllib.parse import urljoin
from pathlib import Path
# =========================
# 1. 基本设置
# =========================

# 用来存所有年份、所有摩托车的数据
motorcycles = []

# 设置 User-Agent，告诉网站这是课程练习请求
headers = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}


# =========================
# 2. 循环不同年份
# =========================

# 先不要抓很多年。
# 建议第一次只测试一个年份，例如 2025：
for year in range(2023, 2026):

    # 根据年份自动构造 URL
    url = f"https://bikez.com/year/{year}-motorcycle-models.php"

    print(f"Downloading {year}: {url}")


    # =========================
    # 3. 发送 HTTP Request
    # =========================

    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=10
        )

        # 如果出现 404 / 500 等错误，这里会抛出异常
        response.raise_for_status()

    except requests.RequestException as error:
        print(f"Failed to download {year}:")
        print(error)

        # 当前年份失败的话，继续下一个年份
        continue


    # 如果网页字符出现乱码，可以尝试：
    response.encoding = response.apparent_encoding


    # =========================
    # 4. HTML -> BeautifulSoup
    # =========================

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )


    # =========================
    # 5. 找 repeated records
        # =========================

    # 5. 找到摩托车数据表格
    table = soup.find("table", class_="zebra")



    # 6. 找到 class 为 odd 或 even 的数据行
    rows = table.find_all("tr", class_=["odd", "even"])

    for row in rows:
        # 找到这一行里面的所有 td
        cells = row.find_all("td")

        # 正常的摩托车数据行应该有4列
        if len(cells) < 4:
            continue

        # 第一列：车型名称
        name_link = cells[0].find("a")
        name = name_link.get_text(strip=True)

        # 获取详细页面链接
        detail_url = urljoin(url, name_link.get("href"))

        # 第二列：评分状态
        rating = cells[1].get_text(strip=True)

        # 第三列：摩托车类别
        category = cells[2].get_text(strip=True)

        # 第四列：发动机排量或 Electric
        engine = cells[3].get_text(strip=True)

        motorcycle = {
            "year": year,
            "name": name,
            "rating": rating,
            "category": category,
            "engine": engine,
            "detail_url": detail_url
        }

        motorcycles.append(motorcycle)



    # =========================
    # 8. Rate Limiting
    # =========================

    # 每处理完一个年份后等待 1 秒，
    # 避免短时间向服务器发送过多请求
    time.sleep(1)


# =========================
# 9. 转成 DataFrame
# =========================

df = pd.DataFrame(motorcycles)

print("\n===== Result =====")

print(df.head())

print(
    "Total records:",
    len(df)
)


# =========================
# 10. 保存 CSV
# =========================


output_path = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "lab3_moto_data_2023_2025.csv"
)

output_path.parent.mkdir(
    parents=True,
    exist_ok=True
)

df.to_csv(
    output_path,
    index=False,
    encoding="utf-8-sig"
)

print("Saved to:", output_path)