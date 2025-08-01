import boto3
import json
import requests
import time
import os

sqs = boto3.client('sqs', region_name=os.getenv('AWS_REGION', 'eu-central-1'))
s3 = boto3.client('s3', region_name=os.getenv('AWS_REGION', 'eu-central-1'))

QUEUE_URL = os.getenv('SQS_QUEUE_URL')
FRONTEND_URL = os.getenv('FRONTEND_URL')

def poll_sqs():
    while True:
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

                head_obj = s3.head_object(Bucket=bucket, Key=key)
                size_bytes = head_obj['ContentLength']

                print(f"Файл: {key}, Размер: {size_bytes} байт")


                r = requests.post(FRONTEND_URL + '/size-report', json={
                    "filename": key,
                    "size_bytes": size_bytes
                })
                if r.status_code != 200:
                    print(f"Ошибка отправки данных во фронтенд: {r.status_code} {r.text}")


                sqs.delete_message(
                    QueueUrl=QUEUE_URL,
                    ReceiptHandle=msg['ReceiptHandle']
                )

            except Exception as e:
                print("Ошибка обработки:", e)

        time.sleep(1)

if __name__ == '__main__':
    print("Запуск Inspector...")
    poll_sqs()
