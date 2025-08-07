import boto3
import json
import requests
import time
import os
from flask import Flask
from urllib.parse import unquote_plus
import botocore.exceptions

AWS_REGION = os.getenv('AWS_REGION', 'eu-central-1')
QUEUE_URL = os.getenv('SQS_QUEUE_URL')
FRONTEND_URL = os.getenv('FRONTEND_URL')

if not QUEUE_URL or not FRONTEND_URL:
    raise Exception("Environment variables SQS_QUEUE_URL and FRONTEND_URL must be set")

sqs = boto3.client('sqs', region_name=AWS_REGION)
s3 = boto3.client('s3', region_name=AWS_REGION)

app = Flask(__name__)

def poll_sqs():
    while True:
        try:
            response = sqs.receive_message(
                QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=10
            )
            messages = response.get('Messages', [])
            for msg in messages:
                try:
                    body = json.loads(msg['Body'])

                    bucket = body['bucket']
                    key = body['key']
                    print(f"[INFO] Received from SQS → bucket: {bucket}, key: {key}")

                    for attempt in range(5):
                        try:
                            head_obj = s3.head_object(Bucket=bucket, Key=key)
                            break
                        except botocore.exceptions.ClientError as e:
                            print(f"[WARN] Attempt {attempt+1}: head_object failed, retrying in 1s...")
                            time.sleep(1)
                    else:
                        print(f"[ERROR] Failed to get head_object for {key} after 5 attempts.")
                        continue

                    size_bytes = head_obj['ContentLength']
                    print(f"[SUCCESS] File: {key}, Size: {size_bytes} bytes")

                    response = requests.post(f"{FRONTEND_URL}/size-report", json={
                        "filename": key,
                        "size_bytes": size_bytes
                    })

                    if response.status_code != 200:
                        print(f"[ERROR] Failed to send size to frontend: {response.status_code} {response.text}")

                    sqs.delete_message(
                        QueueUrl=QUEUE_URL,
                        ReceiptHandle=msg['ReceiptHandle']
                    )
                    print(f"[INFO] Message deleted from SQS.")

                except Exception as e:
                    print(f"[ERROR] Error handling message: {e}")

        except Exception as e:
            print(f"[ERROR] Error polling SQS: {e}")

        time.sleep(1)


@app.route("/")
def hello():
    return "Inspector is running!", 200

if __name__ == '__main__':
    print("[INFO] Starting Inspector...")

    import threading
    threading.Thread(target=poll_sqs, daemon=True).start()

    app.run(host="0.0.0.0", port=5000)
