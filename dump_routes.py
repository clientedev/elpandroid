
import sys
import os

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from app import app

print("Dumping URL Map:")
for rule in app.url_map.iter_rules():
    if 'editarrel' in str(rule) or 'new' in str(rule):
        print(f"{rule} -> {rule.endpoint}")
