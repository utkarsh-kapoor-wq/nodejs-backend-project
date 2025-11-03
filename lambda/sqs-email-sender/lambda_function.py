import json
import boto3
import psycopg2
from utils.db import get_connection
from utils.otp import create_otp_record

ses = boto3.client("ses", region_name="ap-south-1")

def lambda_handler(event, context):
    print("Received event:", json.dumps(event, indent=2))

    for record in event["Records"]:
        body = json.loads(record["body"])
        email = body.get("email")
        otp_type = body.get("type", "email_verification")

        try:
            conn = get_connection()
            cursor = conn.cursor()

            cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
            result = cursor.fetchone()
            if not result:
                print(f"User not found for email: {email}")
                continue

            user_id = result[0]

            otp_record = create_otp_record(user_id, otp_type)
            cursor.execute("""
                INSERT INTO otp_codes (id, user_id, code, type, expires_at, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                otp_record["id"],
                otp_record["user_id"],
                otp_record["code"],
                otp_record["type"],
                otp_record["expires_at"],
                otp_record["created_at"]
            ))
            conn.commit()

            print(f"OTP stored in DB for user_id: {user_id}")

            email_subject = "Your Verification Code"
            email_body = f"Your OTP is {otp_record['code']}. It will expire in 10 minutes."

            ses.send_email(
                Source="mitrashubhojit2005@gmail.com",
                Destination={"ToAddresses": [email]},
                Message={
                    "Subject": {"Data": email_subject},
                    "Body": {"Text": {"Data": email_body}},
                },
            )

            print(f"OTP sent to {email}")

        except Exception as e:
            print("Error processing email:", email, str(e))

        finally:
            if 'cursor' in locals(): cursor.close()
            if 'conn' in locals(): conn.close()

    return {"statusCode": 200, "body": "All messages processed"}
