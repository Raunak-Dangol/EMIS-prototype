import sqlite3
import os
import sys

# Path to db
db_path = r"d:\prototype emis\BACKEND\database.db"

# 1. Drop table via sqlite natively
conn = sqlite3.connect(db_path)
cur = conn.cursor()
try:
    cur.execute("DROP TABLE IF EXISTS teachers;")
    cur.execute("DELETE FROM users WHERE role='teacher';")
    conn.commit()
    print("Dropped old teachers table and deleted teacher users.")
except Exception as e:
    print("Error dropping table:", e)
finally:
    conn.close()

# 2. Add backend dir to python path to import app and db safely
sys.path.append(r"d:\prototype emis\BACKEND")

try:
    from app import app
    from database import db
    with app.app_context():
        # This will create the teachers table exactly as defined in the updated models.py
        db.create_all()
        print("Recreated teachers table adhering to new schema.")
except Exception as e:
    print("Error recreating schema:", e)

