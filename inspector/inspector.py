import boto3
import json
import requests
import time
import os
from flask import Flask

# No dotenv import or load_dotenv — we expect env vars from OS environment

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
                    s3_event = json.loads(body['Message'])
                    record = s3_event['Records'][0]
                    bucket = record['s3']['bucket']['name']
                    key = record['s3']['object']['key']

                    # Use head_object to get file size without downloading
                    head_obj = s3.head_object(Bucket=bucket, Key=key)
                    size_bytes = head_obj['ContentLength']

                    print(f"File: {key}, Size: {size_bytes} bytes")

                    r = requests.post(FRONTEND_URL + '/size-report', json={
                        "filename": key,
                        "size_bytes": size_bytes
                    })

                    if r.status_code != 200:
                        print(f"Error sending data to frontend: {r.status_code} {r.text}")

                    # Delete message after successful processing
                    sqs.delete_message(
                        QueueUrl=QUEUE_URL,
                        ReceiptHandle=msg['ReceiptHandle']
                    )

                except Exception as e:
                    print("Error handling message:", e)

        except Exception as e:
            print("Error polling SQS:", e)

        time.sleep(1)

@app.route("/")
def hello():
    return "Inspector is running!", 200

if __name__ == '__main__':
    print("Starting Inspector...")
    import threading
    threading.Thread(target=poll_sqs, daemon=True).start()

    app.run(host="0.0.0.0", port=5000)
