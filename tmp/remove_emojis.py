import os
import re

FRONTEND_DIR = r"d:\prototype emis\FRONTEND"

# A list of emojis discovered in the codebase
emojis_to_remove = [
    "🎓", "👨‍🏫", "✅", "📖", "🔬", "💼", "📜", "📋", "📝", "📚", "💾", 
    "✏️", "🗑️", "🚪", "ℹ️", "❌", "📊"
]

for root, dirs, files in os.walk(FRONTEND_DIR):
    for str_file in files:
        if str_file.endswith(".html") or str_file.endswith(".js"):
            filepath = os.path.join(root, str_file)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            new_content = content
            for emoji in emojis_to_remove:
                new_content = new_content.replace(emoji, "")

            if new_content != content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Removed emojis from {filepath}")
print("Done")
