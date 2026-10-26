from pathlib import Path

path = Path('scripts/setup/apply-workflow-remap.py')
text = path.read_text()
start_marker = "replace_once(\n    'server/email/templates.ts',\n    \"        `<p>Finance approved this request and processing has started."
end_marker = "\n\n\n# -----------------------------------------------------------------------------\n# Request form: advisory checklist + clearer optional attachment reminder."
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError('Could not find the processing_started replacement block to repair.')
replacement = r'''replace_once(
    'server/email/templates.ts',
    r'''        `<p>Finance approved this request and processing has started.</p>${summary(request)}<div style="margin:20px 0;padding:14px 16px;background:#edf8f2;border-radius:8px"><strong>Target release date:</strong> ${escape(payload.plannedCheckDate || 'To be confirmed')}</div>${remarks}`,''',
    r'''        `<p>Hard-copy verification is approved and the 3-day Finance processing clock has started.</p>${digitalReceipt(request, siteUrl)}<div style="margin:20px 0;padding:14px 16px;background:#edf8f2;border-radius:8px"><strong>3-day processing deadline:</strong> ${escape(payload.processingDueAt || payload.plannedCheckDate || 'To be confirmed')}</div>${remarks}`,''',
)'''
path.write_text(text[:start] + replacement + text[end:])
print('Repaired workflow remap script quoting.')
