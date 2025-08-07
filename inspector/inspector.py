import boto3
import time
import os
import requests
import json

print("Starting inspector...")

# Load environment variables
bucket_name = os.getenv("BUCKET_NAME")
queue_name = os.getenv("QUEUE_NAME")
frontend_url = os.getenv("FRONTEND_NOTIFY_URL")

print(f"BUCKET_NAME: {bucket_name}")
print(f"QUEUE_NAME: {queue_name}")
print(f"FRONTEND_NOTIFY_URL: {frontend_url}")

# AWS region and credentials from environment (exported in .env)
region = os.getenv("AWS_REGION")

sqs = boto3.client('sqs', region_name=region)
s3 = boto3.client('s3', region_name=region)

# Get queue URL
try:
    queue_url = sqs.get_queue_url(QueueName=queue_name)["QueueUrl"]
    print(f"Successfully connected to queue: {queue_url}")
except Exception as e:
    print(f"Error connecting to queue: {e}")
    try:
        queues = sqs.list_queues()
        print(f"Available queues: {queues}")
    except Exception as e2:
        print(f"Error listing queues: {e2}")
    exit(1)

print("Inspector is running and listening to the queue...")

# Main loop
while True:
    try:
        messages = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=1)

        if 'Messages' in messages:
            for msg in messages['Messages']:
                print("Received message:", msg['Body'])

                try:
                    message_data = json.loads(msg['Body'])

                    if 'Records' in message_data:
                        for record in message_data['Records']:
                            if record.get('eventName') == 'ObjectCreated:Put':
                                s3_data = record.get('s3', {})
                                object_data = s3_data.get('object', {})

                                key = object_data.get('key', '')
                                size = object_data.get('size', 0)

                                print(f"Extracted file: {key}")
                                print(f"File size: {size} bytes")

                                # Notify frontend
                                data = {
                                    "filename": key,
                                    "size": size
                                }

                                try:
                                    res = requests.post(frontend_url, json=data)
                                    print(f"Notification sent: {res.status_code}")
                                except Exception as e:
                                    print(f"Error sending notification: {e}")

                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON message: {e}")
                except Exception as e:
                    print(f"Error processing message: {e}")

                # Delete message from queue
                sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=msg['ReceiptHandle'])
        else:
            time.sleep(1)

    except Exception as e:
        print(f"Error in main loop: {e}")
        time.sleep(5)


from flask import Flask
from threading import Thread

app = Flask(__name__)

@app.route("/")
def index():
    return "Inspector is running"

def run_flask():
    app.run(host="0.0.0.0", port=5000)


if __name__ == "__main__":

    flask_thread = Thread(target=run_flask)
    flask_thread.start()

   
    poll_sqs()
