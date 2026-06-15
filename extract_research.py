import json
import os

transcript_path = r'c:\Users\kanis\.cursor\projects\d-test-misc-the-tell\agent-transcripts\f04b1afd-47a6-4c6f-8fda-c3ad253212a6\subagents\2700df87-3434-44b3-9782-8c34b4225672.jsonl'

with open(transcript_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 6 has the markdown content
data = json.loads(lines[6])
content = data['message']['content']
for item in content:
    if item.get('type') == 'text':
        text = item['text']

# Find the start of markdown content after ```markdown
start_marker = '```markdown\n'
start_idx = text.find(start_marker)
if start_idx == -1:
    print("ERROR: Could not find ```markdown marker")
    exit(1)

content_start = start_idx + len(start_marker)

# The content is truncated (no closing ```), so take everything from content_start to end
# But we need to check if there IS a closing ``` AFTER the content start
remaining = text[content_start:]
close_idx = remaining.rfind('```')
if close_idx != -1:
    # Found closing ``` - extract between markers
    full_markdown = remaining[:close_idx].rstrip()
    print(f"Found closing ``` at position {close_idx}")
else:
    # No closing ``` - content is truncated, take everything
    full_markdown = remaining.rstrip()
    print("No closing ``` found - content is truncated")

print(f"Extracted {len(full_markdown)} characters")
print(f"\nLast 200 chars:\n{full_markdown[-200:]}")

# Write to file
output_dir = r'D:\test_misc\the_tell\docs\research'
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, '02-financial-data-analytics-platforms.md')

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(full_markdown)

print(f"\nWritten to: {output_path}")
print(f"File size: {os.path.getsize(output_path)} bytes")
