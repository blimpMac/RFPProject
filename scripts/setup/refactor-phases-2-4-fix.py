from pathlib import Path

path = Path('src/features/approvals/workflow.ts')
text = path.read_text()
old = "export const requiresOriginals = (_request: RfpRequest) => true;"
new = """export const requiresOriginals = (request: RfpRequest) => {
  void request;
  return true;
};"""
if old not in text:
    raise SystemExit('Expected requiresOriginals helper was not found')
path.write_text(text.replace(old, new, 1))
