"""
Migration script: Add parent details & profile_image columns to the students table.
Run this ONCE to update the existing database without losing data.

Usage:
    cd BACKEND
    python ../tmp/migrate_db.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'BACKEND', 'database.db')
DB_PATH = os.path.abspath(DB_PATH)

NEW_COLUMNS = [
    ("father_name",      "VARCHAR(150)"),
    ("father_phone",     "VARCHAR(20)"),
    ("mother_name",      "VARCHAR(150)"),
    ("mother_phone",     "VARCHAR(20)"),
    ("parent_education", "VARCHAR(50)"),
    ("profile_image",    "VARCHAR(255)"),
]


def migrate():
    print(f"Connecting to: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("ERROR: database.db not found at that path.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get existing columns
    cursor.execute("PRAGMA table_info(students);")
    existing = {row[1] for row in cursor.fetchall()}
    print(f"Existing columns: {sorted(existing)}")

    added = 0
    for col_name, col_type in NEW_COLUMNS:
        if col_name in existing:
            print(f"  SKIP  {col_name} (already exists)")
        else:
            sql = f"ALTER TABLE students ADD COLUMN {col_name} {col_type};"
            cursor.execute(sql)
            print(f"  ADDED {col_name} ({col_type})")
            added += 1

    conn.commit()
    conn.close()
    print(f"\nDone. {added} column(s) added.")


if __name__ == "__main__":
    migrate()
