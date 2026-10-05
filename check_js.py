import re

with open('templates/projects/form.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the last <script> tag
script_matches = list(re.finditer(r'<script>(.*?)</script>', html, re.DOTALL))
if not script_matches:
    print("No script tags found")
    exit(1)

script = script_matches[-1].group(1)

# Remove jinja loops
script = re.sub(r'\{%.*?%\}', '', script)

# Replace jinja variables with a valid string literal if they are outside quotes
# Or just replace all {{...}} with "jinja_var"
script = re.sub(r'\{\{.*?\}\}', '"jinja_var"', script)

with open('test.js', 'w', encoding='utf-8') as f:
    f.write(script)

print("Saved test.js")
