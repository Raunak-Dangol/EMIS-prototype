import os

html_path = r"d:\prototype emis\FRONTEND\student\dashboard.html"
js_path = r"d:\prototype emis\FRONTEND\student\dashboard.js"

with open(html_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

script_start = -1
script_end = -1

for i, line in enumerate(lines):
    if "<script>" in line and script_start == -1 and i > 200:
        script_start = i
    if "</script>" in line and script_start != -1 and i > 200:
        script_end = i
        break

if script_start != -1 and script_end != -1:
    js_lines = lines[script_start+1 : script_end]
    
    with open(js_path, "w", encoding="utf-8") as f:
        f.writelines(js_lines)
        
    new_html = lines[:script_start] + ["    <script src=\"/student/dashboard.js\"></script>\n"] + lines[script_end+1:]
    with open(html_path, "w", encoding="utf-8") as f:
        f.writelines(new_html)
    print("Successfully split the JavaScript into dashboard.js")
else:
    print("Could not find the script tags!")
