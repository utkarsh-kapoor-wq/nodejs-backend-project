import random
import string
from datetime import datetime, timedelta
import uuid

def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))

def create_otp_record(user_id, otp_type="email_verification"):
    code = generate_otp()
    otp_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    created_at = datetime.utcnow()

    return {
        "id": otp_id,
        "user_id": user_id,
        "code": code,
        "type": otp_type,
        "expires_at": expires_at,
        "created_at": created_at
    }
