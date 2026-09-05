# Lab 4 data pipeline

The raw sample is derived from the **Customer Support on Twitter** dataset by
Thought Vector, distributed under CC BY-NC-SA 4.0 for non-commercial course use.

1. Download and unzip `twcs.csv` from the [Kaggle dataset page](https://www.kaggle.com/datasets/thoughtvector/customer-support-on-twitter).
2. Recreate the balanced 5,000-row sample:

   ```bash
   python acquire_tweets.py --source ../data/archive/twcs/twcs.csv
   ```

3. Create the cleaned and aggregate data files:

   ```bash
   python clean_tweets.py --batch-size 32
   ```

The second command downloads `cardiffnlp/twitter-roberta-base-sentiment-latest`
on its first run. Sentiment columns are model-generated estimates, not
ground-truth annotations.
